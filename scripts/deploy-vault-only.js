const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying additional PrivateVault to Sepolia...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);
  console.log("💰 Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // Use existing contract addresses
  const verifierAddress = process.env.VERIFIER_ADDRESS || "0x28B40263C3061ac0Ff3a4E2F8EefBaD04A952de5";
  const poseidonAddress = process.env.POSEIDON_ADDRESS || "0x843af53C69C3953dBE1B0d0eCbF2Eff2E4b23d43";
  const registryAddress = process.env.INDEXER_REGISTRY_ADDRESS || "0x098cb0db955Ba6983B1240a1F356252DCB519847";

  console.log("📋 Using existing contracts:");
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

  // Index the vault with the existing registry
  console.log("\n🔗 Indexing vault with existing registry...");
  const indexTx = await vault.indexWithRegistry(registryAddress);
  await indexTx.wait();
  console.log("✅ Vault indexed successfully");

  // Verify indexing
  const IndexerRegistry = await hre.ethers.getContractFactory("IndexerRegistry");
  const registry = IndexerRegistry.attach(registryAddress);
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

  console.log("\n✨ Deployment Summary:");
  console.log("━".repeat(40));
  console.log("New PrivateVault:", vaultAddress);
  console.log("━".repeat(40));

  console.log("\n🎉 Additional vault deployed and indexed!");
  console.log("📡 The indexer should automatically detect this new vault within 30 seconds.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });