const hre = require("hardhat");

async function main() {
  console.log("🔄 Setting canonical codehash for factory-deployed vaults...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Operating with account:", deployer.address);

  // Contract addresses
  const registryAddress = "0x098cb0db955Ba6983B1240a1F356252DCB519847";
  const factoryAddress = "0x5Cd1572B6865D8641615E7C01fB438218616d695";

  console.log("📋 Using contracts:");
  console.log("   IndexerRegistry:", registryAddress);
  console.log("   ObscuraFactory:", factoryAddress);

  // Get the canonical codehash from factory-deployed vault
  const canonicalCodeHash = "0x98ea1214d9067670163e1937d5696d2e5571578822801d92e48dbf0a724c669b";
  console.log("🎯 New canonical codehash:", canonicalCodeHash);

  // Get current canonical codehash
  const IndexerRegistry = await hre.ethers.getContractFactory("IndexerRegistry");
  const registry = IndexerRegistry.attach(registryAddress);
  const currentCodeHash = await registry.CANONICAL_VAULT_CODEHASH();
  console.log("🎯 Current canonical codehash:", currentCodeHash);

  // Update canonical codehash
  console.log("\n📝 Updating canonical codehash...");
  const updateTx = await registry.setCanonicalCodeHash(canonicalCodeHash);
  await updateTx.wait();
  console.log("✅ Canonical codehash updated successfully");

  // Verify the update
  const updatedCodeHash = await registry.CANONICAL_VAULT_CODEHASH();
  console.log("🔍 Updated canonical codehash:", updatedCodeHash);
  console.log("✅ Match:", updatedCodeHash === canonicalCodeHash);

  // Get factory deployment info
  const ObscuraFactory = await hre.ethers.getContractFactory("ObscuraFactory");
  const factory = ObscuraFactory.attach(factoryAddress);

  const deployment1 = await factory.getDeploymentInfo(0);
  const deployment2 = await factory.getDeploymentInfo(1);

  console.log("\n🏦 Factory deployments:");
  console.log("   Vault 1:", deployment1.vault, "(active:", deployment1.active, ")");
  console.log("   Vault 2:", deployment2.vault, "(active:", deployment2.active, ")");

  // Index the factory vaults
  console.log("\n🔗 Indexing factory vaults...");

  const PrivateVault = await hre.ethers.getContractFactory("PrivateVault");

  // Index vault 1
  console.log("   Indexing vault 1...");
  const vault1 = PrivateVault.attach(deployment1.vault);
  const indexTx1 = await vault1.indexWithRegistry(registryAddress);
  await indexTx1.wait();
  console.log("   ✅ Vault 1 indexed");

  // Index vault 2
  console.log("   Indexing vault 2...");
  const vault2 = PrivateVault.attach(deployment2.vault);
  const indexTx2 = await vault2.indexWithRegistry(registryAddress);
  await indexTx2.wait();
  console.log("   ✅ Vault 2 indexed");

  // Verify indexing
  const isIndexed1 = await registry.isVaultIndexed(deployment1.vault);
  const isIndexed2 = await registry.isVaultIndexed(deployment2.vault);
  console.log("🔍 Vault 1 indexed status:", isIndexed1);
  console.log("🔍 Vault 2 indexed status:", isIndexed2);

  console.log("\n✨ Canonical Setup Summary:");
  console.log("━".repeat(60));
  console.log("Canonical CodeHash: ", canonicalCodeHash);
  console.log("Vault 1 Indexed:    ", isIndexed1);
  console.log("Vault 2 Indexed:    ", isIndexed2);
  console.log("━".repeat(60));

  console.log("\n🎉 Canonical codehash set! Factory-deployed vaults are now indexable.");
  console.log("📡 The indexer will detect these vaults with the correct codehash.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Setup failed:", error);
    process.exit(1);
  });