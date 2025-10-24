const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying one more PrivateVault to test indexing...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);
  console.log("💰 Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // Use the fresh contract addresses
  const verifierAddress = process.env.VERIFIER_ADDRESS || "0x28B40263C3061ac0Ff3a4E2F8EefBaD04A952de5";
  const poseidonAddress = process.env.POSEIDON_ADDRESS || "0x843af53C69C3953dBE1B0d0eCbF2Eff2E4b23d43";
  const registryAddress = process.env.INDEXER_REGISTRY_ADDRESS || "0x098cb0db955Ba6983B1240a1F356252DCB519847";

  console.log("📋 Using fresh contracts:");
  console.log("   Verifier:", verifierAddress);
  console.log("   PoseidonT3:", poseidonAddress);
  console.log("   IndexerRegistry:", registryAddress);

  // Deploy new PrivateVault
  console.log("\n🏦 Deploying new PrivateVault...");
  const PrivateVault = await hre.ethers.getContractFactory("PrivateVault");
  const vault = await PrivateVault.deploy(verifierAddress, poseidonAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("✅ New PrivateVault deployed to:", vaultAddress);

  // Get vault codehash
  const vaultCodeHash = await hre.ethers.provider.getCode(vaultAddress).then(code => hre.ethers.keccak256(code));
  console.log("🔍 Vault codehash:", vaultCodeHash);

  // Check canonical codehash in registry
  const IndexerRegistry = await hre.ethers.getContractFactory("IndexerRegistry");
  const registry = IndexerRegistry.attach(registryAddress);
  const canonicalCodeHash = await registry.CANONICAL_VAULT_CODEHASH();
  console.log("🎯 Canonical codehash:", canonicalCodeHash);
  console.log("✅ Codehash matches canonical:", vaultCodeHash === canonicalCodeHash);

  // Index the vault with the registry
  console.log("\n🔗 Indexing vault with registry...");
  const indexTx = await vault.indexWithRegistry(registryAddress);
  await indexTx.wait();
  console.log("✅ Vault indexed successfully");

  // Verify indexing
  const isIndexed = await registry.isVaultIndexed(vaultAddress);
  console.log("🔍 Vault indexed status:", isIndexed);

  // Get initial stats
  console.log("\n📊 Initial Vault Statistics:");
  const stats = await vault.getStatistics();
  console.log("   Total deposits:", stats[0].toString());
  console.log("   Total withdrawals:", stats[1].toString());
  console.log("   Total fees:", stats[2].toString());
  console.log("   Next index:", stats[3].toString());
  console.log("   Current root:", stats[4].toString());

  console.log("\n✨ Test Deployment Summary:");
  console.log("━".repeat(50));
  console.log("New PrivateVault:", vaultAddress);
  console.log("CodeHash matches:", vaultCodeHash === canonicalCodeHash);
  console.log("Indexed:", isIndexed);
  console.log("━".repeat(50));

  console.log("\n🎉 Test vault deployed and indexed!");
  console.log("📡 The indexer should automatically detect this vault within 30 seconds.");
  console.log("🔍 Check the logs and API at http://localhost:3001/vaults/active");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Test deployment failed:", error);
    process.exit(1);
  });