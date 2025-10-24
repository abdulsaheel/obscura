/**
 * Canonical Obscura deployment.
 *
 * Deploys Verifier + PoseidonT3 + ObscuraFactory, then one canonical
 * PrivateVault, derives its runtime codehash, deploys the IndexerRegistry with
 * that codehash, and indexes the vault. Writes deployments/<network>.json.
 *
 * NOTE: `verifier` and `hasher` are immutables embedded in the vault's runtime
 * bytecode, so every canonical vault MUST be deployed with these same two
 * addresses to share the canonical codehash.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network sepolia
 *   npx hardhat run scripts/deploy.js --network localhost
 */
const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log(`\n🚀 Deploying Obscura to "${network.name}"`);
  console.log(`   Deployer: ${deployer.address}`);
  console.log(`   Balance:  ${ethers.formatEther(balance)} ETH\n`);

  // 1. Verifier
  const Verifier = await ethers.getContractFactory('Groth16Verifier');
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log('✅ Groth16Verifier:', verifierAddress);

  // 2. Poseidon hasher
  const Poseidon = await ethers.getContractFactory('PoseidonT3');
  const hasher = await Poseidon.deploy();
  await hasher.waitForDeployment();
  const hasherAddress = await hasher.getAddress();
  console.log('✅ PoseidonT3:     ', hasherAddress);

  // 3. Factory (for permissionless canonical vault deployment / Hydra scaling)
  const Factory = await ethers.getContractFactory('ObscuraFactory');
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log('✅ ObscuraFactory: ', factoryAddress);

  // 4. Canonical vault (deployed directly; same verifier+hasher => canonical codehash)
  const Vault = await ethers.getContractFactory('PrivateVault');
  const vault = await Vault.deploy(verifierAddress, hasherAddress, deployer.address);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log('✅ PrivateVault:   ', vaultAddress);

  // 5. Canonical codehash (runtime bytecode hash)
  const code = await ethers.provider.getCode(vaultAddress);
  const canonicalCodeHash = ethers.keccak256(code);
  console.log('🔑 Canonical codehash:', canonicalCodeHash);

  // 6. Registry pinned to the canonical codehash
  const Registry = await ethers.getContractFactory('IndexerRegistry');
  const registry = await Registry.deploy(canonicalCodeHash);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log('✅ IndexerRegistry:', registryAddress);

  // 7. Index the canonical vault
  const tx = await vault.indexWithRegistry(registryAddress);
  await tx.wait();
  console.log('🔗 Vault indexed:', await registry.isVaultIndexed(vaultAddress));

  // 8. Persist deployment
  const deployment = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      Groth16Verifier: verifierAddress,
      PoseidonT3: hasherAddress,
      ObscuraFactory: factoryAddress,
      PrivateVault: vaultAddress,
      IndexerRegistry: registryAddress,
    },
    canonicalCodeHash,
  };

  const dir = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(dir, { recursive: true });
  const outFile = path.join(dir, `${network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log(`\n💾 Wrote ${path.relative(process.cwd(), outFile)}`);

  console.log('\n📋 Next steps:');
  console.log(`   indexer/.env  -> INDEXER_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`   indexer/.env  -> CANONICAL_CODEHASH=${canonicalCodeHash}`);
  console.log(`   frontend/.env -> VITE_INDEXER_URL=http://localhost:3001\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
