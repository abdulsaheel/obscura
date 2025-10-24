const hre = require("hardhat");

async function main() {
  console.log("🔄 Updating canonical codehash to accept new vault...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Operating with account:", deployer.address);

  // Contract addresses
  const registryAddress = process.env.INDEXER_REGISTRY_ADDRESS || "0x098cb0db955Ba6983B1240a1F356252DCB519847";
  const newVaultAddress = "0x92C29816e2c3507eFE5825F98B6E5cb5514d7e2b";

  console.log("📋 Using contracts:");
  console.log("   IndexerRegistry:", registryAddress);
  console.log("   New Vault:", newVaultAddress);

  // Get the new vault's codehash
  console.log("\n🔍 Getting new vault's codehash...");
  const code = await hre.ethers.provider.getCode(newVaultAddress);
  const newCodeHash = hre.ethers.keccak256(code);
  console.log("🔢 New vault codehash:", newCodeHash);

  // Get current canonical codehash
  const IndexerRegistry = await hre.ethers.getContractFactory("IndexerRegistry");
  const registry = IndexerRegistry.attach(registryAddress);
  const currentCodeHash = await registry.CANONICAL_VAULT_CODEHASH();
  console.log("🎯 Current canonical codehash:", currentCodeHash);

  // Update canonical codehash
  console.log("\n📝 Updating canonical codehash...");
  const updateTx = await registry.setCanonicalCodeHash(newCodeHash);
  await updateTx.wait();
  console.log("✅ Canonical codehash updated successfully");

  // Verify the update
  const updatedCodeHash = await registry.CANONICAL_VAULT_CODEHASH();
  console.log("🔍 Updated canonical codehash:", updatedCodeHash);
  console.log("✅ Match:", updatedCodeHash === newCodeHash);

  // Now try to index the vault
  console.log("\n🔗 Indexing vault with updated registry...");
  const PrivateVault = await hre.ethers.getContractFactory("PrivateVault");
  const vault = PrivateVault.attach(newVaultAddress);
  const indexTx = await vault.indexWithRegistry(registryAddress);
  await indexTx.wait();
  console.log("✅ Vault indexed successfully");

  // Verify indexing
  const isIndexed = await registry.isVaultIndexed(newVaultAddress);
  console.log("🔍 Vault indexed status:", isIndexed);

  console.log("\n✨ Update Summary:");
  console.log("━".repeat(50));
  console.log("New canonical codehash:", newCodeHash);
  console.log("Vault indexed:", isIndexed);
  console.log("━".repeat(50));

  console.log("\n🎉 Vault successfully added to registry!");
  console.log("📡 The indexer should automatically detect this vault within 30 seconds.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Update failed:", error);
    process.exit(1);
  });