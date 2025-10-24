const { expect } = require('chai');
const { ethers } = require('hardhat');
const fs = require('fs');

const { IncrementalMerkleTree } = require('../scripts/lib/merkle');
const {
  commitment,
  nullifierHash,
  generateProof,
  formatProof,
  ZKEY_PATH,
  WASM_PATH,
} = require('../scripts/lib/proof');

const ONE_ETH = ethers.parseEther('1');
const SECRET = 111111111111111111111111111111111111111n;
const NULLIFIER = 222222222222222222222222222222222222222n;

const haveArtifacts = fs.existsSync(ZKEY_PATH) && fs.existsSync(WASM_PATH);

async function deployFixture() {
  const [owner, relayer, recipient, other] = await ethers.getSigners();

  const Poseidon = await ethers.getContractFactory('PoseidonT3');
  const hasher = await Poseidon.deploy();
  await hasher.waitForDeployment();

  const Verifier = await ethers.getContractFactory('Groth16Verifier');
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();

  const Vault = await ethers.getContractFactory('PrivateVault');
  const vault = await Vault.deploy(
    await verifier.getAddress(),
    await hasher.getAddress(),
    owner.address
  );
  await vault.waitForDeployment();

  return { vault, verifier, hasher, owner, relayer, recipient, other };
}

describe('PrivateVault', function () {
  describe('Deployment', function () {
    it('initializes with empty tree state', async function () {
      const { vault } = await deployFixture();
      const stats = await vault.getStatistics();
      expect(stats[0]).to.equal(0n); // totalDeposits
      expect(stats[1]).to.equal(0n); // totalWithdrawals
      expect(stats[3]).to.equal(0n); // nextIndex
      // initial root == empty-tree root from the zero chain
      const tree = new IncrementalMerkleTree();
      expect(await vault.getLastRoot()).to.equal(tree.zeros[20]);
    });
  });

  describe('Deposit', function () {
    it('accepts a deposit and updates the root to match the off-chain tree', async function () {
      const { vault } = await deployFixture();
      const c = commitment(SECRET, NULLIFIER, ONE_ETH);

      await expect(vault.deposit(c, { value: ONE_ETH }))
        .to.emit(vault, 'Deposit')
        .withArgs(c, 0n, ONE_ETH, anyUint(), await firstSigner());

      const tree = new IncrementalMerkleTree();
      tree.insert(c);
      expect(await vault.getLastRoot()).to.equal(tree.root());

      const stats = await vault.getStatistics();
      expect(stats[0]).to.equal(1n);
      expect(stats[3]).to.equal(1n);
    });

    it('rejects deposits that are too small or too large', async function () {
      const { vault } = await deployFixture();
      const c = commitment(SECRET, NULLIFIER, ONE_ETH);
      await expect(vault.deposit(c, { value: ethers.parseEther('0.0001') })).to.be.revertedWith(
        'Deposit too small'
      );
      await expect(vault.deposit(c, { value: ethers.parseEther('101') })).to.be.revertedWith(
        'Deposit too large'
      );
    });

    it('rejects zero commitment and duplicates', async function () {
      const { vault } = await deployFixture();
      await expect(vault.deposit(0, { value: ONE_ETH })).to.be.revertedWith('Invalid commitment');
      const c = commitment(SECRET, NULLIFIER, ONE_ETH);
      await vault.deposit(c, { value: ONE_ETH });
      await expect(vault.deposit(c, { value: ONE_ETH })).to.be.revertedWith(
        'Commitment already exists'
      );
    });

    it('batchDeposit splits value evenly across commitments', async function () {
      const { vault } = await deployFixture();
      const cs = [
        commitment(1n, 2n, ethers.parseEther('0.5')),
        commitment(3n, 4n, ethers.parseEther('0.5')),
      ];
      await vault.batchDeposit(cs, { value: ONE_ETH });
      const stats = await vault.getStatistics();
      expect(stats[0]).to.equal(2n);
      expect(stats[3]).to.equal(2n);
    });
  });

  describe('Withdraw (real ZK proof)', function () {
    before(function () {
      if (!haveArtifacts) {
        // eslint-disable-next-line no-console
        console.warn('  ! Skipping proof tests: run `npm run build-all` in circuits/ first');
        this.skip();
      }
    });

    it('withdraws to a fresh recipient with a valid proof and collects fee', async function () {
      const { vault, owner, relayer, recipient } = await deployFixture();

      const amount = ONE_ETH;
      const fee = ethers.parseEther('0.005'); // 0.5% <= 1%
      const c = commitment(SECRET, NULLIFIER, amount);
      await vault.deposit(c, { value: amount });

      const tree = new IncrementalMerkleTree();
      tree.insert(c);
      const { pathElements, pathIndices, root } = tree.proof(0);
      expect(root).to.equal(await vault.getLastRoot());

      const { proof, publicSignals } = await generateProof({
        secret: SECRET,
        nullifier: NULLIFIER,
        amount,
        recipient: recipient.address,
        protocolFee: fee,
        root,
        pathElements,
        pathIndices,
      });
      const { pA, pB, pC } = formatProof(proof);

      const recipientBefore = await ethers.provider.getBalance(recipient.address);
      const ownerBefore = await ethers.provider.getBalance(owner.address);

      await expect(vault.connect(relayer).withdraw(pA, pB, pC, publicSignals))
        .to.emit(vault, 'Withdrawal')
        .withArgs(
          ethers.zeroPadValue(ethers.toBeHex(nullifierHash(SECRET, NULLIFIER)), 32),
          recipient.address,
          relayer.address,
          amount - fee,
          fee,
          anyUint()
        );

      expect(await ethers.provider.getBalance(recipient.address)).to.equal(
        recipientBefore + (amount - fee)
      );
      expect(await ethers.provider.getBalance(owner.address)).to.equal(ownerBefore + fee);

      const stats = await vault.getStatistics();
      expect(stats[1]).to.equal(1n); // totalWithdrawals
    });

    it('rejects a re-used nullifier (double spend)', async function () {
      const { vault, relayer, recipient } = await deployFixture();
      const amount = ONE_ETH;
      const fee = 0n;
      const c = commitment(SECRET, NULLIFIER, amount);
      await vault.deposit(c, { value: amount });

      const tree = new IncrementalMerkleTree();
      tree.insert(c);
      const { pathElements, pathIndices, root } = tree.proof(0);
      const { proof, publicSignals } = await generateProof({
        secret: SECRET,
        nullifier: NULLIFIER,
        amount,
        recipient: recipient.address,
        protocolFee: fee,
        root,
        pathElements,
        pathIndices,
      });
      const { pA, pB, pC } = formatProof(proof);

      await vault.connect(relayer).withdraw(pA, pB, pC, publicSignals);
      await expect(vault.connect(relayer).withdraw(pA, pB, pC, publicSignals)).to.be.revertedWith(
        'Nullifier already spent'
      );
    });

    it('rejects a protocol fee above 1%', async function () {
      const { vault, relayer, recipient } = await deployFixture();
      const amount = ONE_ETH;
      const fee = ethers.parseEther('0.02'); // 2% — circuit allows (<= amount), contract rejects
      const c = commitment(SECRET, NULLIFIER, amount);
      await vault.deposit(c, { value: amount });

      const tree = new IncrementalMerkleTree();
      tree.insert(c);
      const { pathElements, pathIndices, root } = tree.proof(0);
      const { proof, publicSignals } = await generateProof({
        secret: SECRET,
        nullifier: NULLIFIER,
        amount,
        recipient: recipient.address,
        protocolFee: fee,
        root,
        pathElements,
        pathIndices,
      });
      const { pA, pB, pC } = formatProof(proof);
      await expect(vault.connect(relayer).withdraw(pA, pB, pC, publicSignals)).to.be.revertedWith(
        'Protocol fee too high'
      );
    });

    it('rejects an unknown Merkle root', async function () {
      const { vault, relayer, recipient } = await deployFixture();
      const amount = ONE_ETH;
      const c = commitment(SECRET, NULLIFIER, amount);
      await vault.deposit(c, { value: amount });

      // Build a proof against a tree that the contract has never seen
      const tree = new IncrementalMerkleTree();
      tree.insert(commitment(9n, 9n, amount)); // different leaf -> different root
      const { pathElements, pathIndices, root } = tree.proof(0);
      const { proof, publicSignals } = await generateProof({
        secret: 9n,
        nullifier: 9n,
        amount,
        recipient: recipient.address,
        protocolFee: 0n,
        root,
        pathElements,
        pathIndices,
      });
      const { pA, pB, pC } = formatProof(proof);
      await expect(vault.connect(relayer).withdraw(pA, pB, pC, publicSignals)).to.be.revertedWith(
        'Unknown Merkle root'
      );
    });
  });

  describe('Access control & admin', function () {
    it('only owner can withdraw fees', async function () {
      const { vault, other } = await deployFixture();
      await expect(vault.connect(other).withdrawFees(1)).to.be.revertedWithCustomError(
        vault,
        'OwnableUnauthorizedAccount'
      );
    });

    it('emergencyWithdraw only works when paused', async function () {
      const { vault, owner, other } = await deployFixture();
      await expect(vault.emergencyWithdraw(owner.address)).to.be.revertedWithCustomError(
        vault,
        'ExpectedPause'
      );
      await expect(vault.connect(other).emergencyWithdraw(other.address)).to.be.reverted;
    });
  });
});

// ---- helpers ----
let _signer0;
async function firstSigner() {
  if (!_signer0) {
    const [s] = await ethers.getSigners();
    _signer0 = s.address;
  }
  return _signer0;
}

// chai-matcher placeholder for "any uint" (timestamp) in withArgs
function anyUint() {
  const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');
  return anyValue;
}
