const { expect } = require('chai');
const { ethers } = require('hardhat');

async function coreFixture() {
  const [owner, deployer, attacker] = await ethers.getSigners();

  const Verifier = await ethers.getContractFactory('Groth16Verifier');
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();

  const Poseidon = await ethers.getContractFactory('PoseidonT3');
  const hasher = await Poseidon.deploy();
  await hasher.waitForDeployment();

  return { owner, deployer, attacker, verifier, hasher };
}

function codehashOf(addr) {
  return ethers.provider.getCode(addr).then((code) => ethers.keccak256(code));
}

describe('ObscuraFactory & IndexerRegistry', function () {
  it('factory-deployed vault shares the canonical codehash of a directly-deployed vault', async function () {
    const { owner, verifier, hasher } = await coreFixture();
    const v = await verifier.getAddress();
    const h = await hasher.getAddress();

    // Directly-deployed vault
    const Vault = await ethers.getContractFactory('PrivateVault');
    const direct = await Vault.deploy(v, h, owner.address);
    await direct.waitForDeployment();
    const directHash = await codehashOf(await direct.getAddress());

    // Factory-deployed vault (same verifier+hasher => same immutables => same codehash)
    const Factory = await ethers.getContractFactory('ObscuraFactory');
    const factory = await Factory.deploy();
    await factory.waitForDeployment();
    const fee = await factory.licenseFee();
    const salt = ethers.id('vault-1');
    const tx = await factory.deployOfficialVault(v, h, salt, { value: fee });
    const receipt = await tx.wait();
    const ev = receipt.logs
      .map((l) => {
        try {
          return factory.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((e) => e && e.name === 'VaultDeployed');
    const factoryVault = ev.args.vault;
    const factoryHash = await codehashOf(factoryVault);

    expect(factoryHash).to.equal(directHash);
    expect(await factory.isOfficialVault(factoryVault)).to.equal(true);
    // ownership handed to the deployer
    const fv = Vault.attach(factoryVault);
    expect(await fv.owner()).to.equal(owner.address);
  });

  it('registry indexes a canonical vault and rejects a non-canonical address', async function () {
    const { owner, verifier, hasher, attacker } = await coreFixture();
    const v = await verifier.getAddress();
    const h = await hasher.getAddress();

    const Vault = await ethers.getContractFactory('PrivateVault');
    const vault = await Vault.deploy(v, h, owner.address);
    await vault.waitForDeployment();
    const canonical = await codehashOf(await vault.getAddress());

    const Registry = await ethers.getContractFactory('IndexerRegistry');
    const registry = await Registry.deploy(canonical);
    await registry.waitForDeployment();

    await vault.indexWithRegistry(await registry.getAddress());
    expect(await registry.isVaultIndexed(await vault.getAddress())).to.equal(true);
    expect(await registry.totalIndexedVaults()).to.equal(1n);

    // A non-canonical address (the verifier) cannot be indexed
    await expect(registry.indexVault(v)).to.be.revertedWith(
      'Vault codehash does not match canonical'
    );
    // Double-index rejected
    await expect(registry.indexVault(await vault.getAddress())).to.be.revertedWith(
      'Vault already indexed'
    );
  });

  it('factory enforces authorization, license fee, and deployment cap', async function () {
    const { verifier, hasher, attacker } = await coreFixture();
    const v = await verifier.getAddress();
    const h = await hasher.getAddress();

    const Factory = await ethers.getContractFactory('ObscuraFactory');
    const factory = await Factory.deploy();
    await factory.waitForDeployment();
    const fee = await factory.licenseFee();

    // unauthorized deployer
    await expect(
      factory.connect(attacker).deployOfficialVault(v, h, ethers.id('x'), { value: fee })
    ).to.be.revertedWith('Not authorized deployer');

    // insufficient license fee
    await expect(
      factory.deployOfficialVault(v, h, ethers.id('y'), { value: fee - 1n })
    ).to.be.revertedWith('Insufficient license fee');

    // deployment cap (MAX_DEPLOYMENTS_PER_ADDRESS = 3)
    for (let i = 0; i < 3; i++) {
      await factory.deployOfficialVault(v, h, ethers.id('cap-' + i), { value: fee });
    }
    await expect(
      factory.deployOfficialVault(v, h, ethers.id('cap-3'), { value: fee })
    ).to.be.revertedWith('Deployment limit exceeded');
  });
});
