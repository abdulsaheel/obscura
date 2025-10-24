const hre = require("hardhat");

async function main() {
  console.log("🚀 Starting Obscura deployment to Sepolia...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying contracts with account:", deployer.address);
  console.log("💰 Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // Deploy Verifier
  console.log("\n📜 Deploying Groth16Verifier...");
  const Verifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("✅ Verifier deployed to:", verifierAddress);

  // Deploy PoseidonT3
  console.log("\n🔐 Deploying PoseidonT3...");
  const PoseidonT3 = await hre.ethers.getContractFactory("PoseidonT3");
  const poseidon = await PoseidonT3.deploy();
  await poseidon.waitForDeployment();
  const poseidonAddress = await poseidon.getAddress();
  console.log("✅ PoseidonT3 deployed to:", poseidonAddress);

  // Deploy PrivateVault
  console.log("\n🏦 Deploying PrivateVault...");
  const PrivateVault = await hre.ethers.getContractFactory("PrivateVault");
  const vault = await PrivateVault.deploy(verifierAddress, poseidonAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("✅ PrivateVault deployed to:", vaultAddress);

  // Get vault codehash
  const vaultCodeHash = await hre.ethers.provider.getCode(vaultAddress).then(code => hre.ethers.keccak256(code));
  console.log("🔍 Vault codehash:", vaultCodeHash);

  // Deploy IndexerRegistry with the vault's codehash
  console.log("\n📋 Deploying IndexerRegistry...");
  const IndexerRegistry = await hre.ethers.getContractFactory("IndexerRegistry");
  const registry = await IndexerRegistry.deploy(vaultCodeHash);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("✅ IndexerRegistry deployed to:", registryAddress);

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

  console.log("\n✨ Deployment Summary:");
  console.log("━".repeat(60));
  console.log("Verifier:        ", verifierAddress);
  console.log("PoseidonT3:      ", poseidonAddress);
  console.log("PrivateVault:    ", vaultAddress);
  console.log("IndexerRegistry: ", registryAddress);
  console.log("Vault CodeHash:  ", vaultCodeHash);
  console.log("━".repeat(60));

  console.log("\n💾 Saving addresses to .env...");
  const fs = require("fs");
  const envPath = require("path").join(__dirname, "../.env");
  let envContent = fs.readFileSync(envPath, "utf8");
  
  // Add or update contract addresses
  const addresses = [
    { key: "VERIFIER_ADDRESS", value: verifierAddress },
    { key: "POSEIDON_ADDRESS", value: poseidonAddress },
    { key: "VAULT_ADDRESS", value: vaultAddress },
    { key: "INDEXER_REGISTRY_ADDRESS", value: registryAddress },
    { key: "CANONICAL_CODEHASH", value: vaultCodeHash },
  ];

  addresses.forEach(({ key, value }) => {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  });

  fs.writeFileSync(envPath, envContent);
  console.log("✅ Addresses saved to .env");

  console.log("\n🎉 Deployment complete! Ready to test.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
