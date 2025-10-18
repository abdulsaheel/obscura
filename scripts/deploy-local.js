const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting Obscura LOCAL deployment...\n");

  // Get deployer
  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying contracts with account:", deployer.address);
  console.log("💰 Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());
  console.log();

  // Deploy Verifier
  console.log("📜 Deploying Groth16Verifier...");
  const Verifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("✅ Verifier deployed to:", verifierAddress);
  console.log();

  // Deploy PoseidonT3
  console.log("🔐 Deploying PoseidonT3...");
  const PoseidonT3 = await hre.ethers.getContractFactory("PoseidonT3");
  const poseidon = await PoseidonT3.deploy();
  await poseidon.waitForDeployment();
  const poseidonAddress = await poseidon.getAddress();
  console.log("✅ PoseidonT3 deployed to:", poseidonAddress);
  console.log();

  // Deploy PrivateVault
  console.log("🏦 Deploying PrivateVault...");
  const PrivateVault = await hre.ethers.getContractFactory("PrivateVault");
  const vault = await PrivateVault.deploy(verifierAddress, poseidonAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("✅ PrivateVault deployed to:", vaultAddress);
  console.log();

  // Get vault stats
  const vaultState = await vault.vaultState();
  console.log("📊 Initial Vault Statistics:");
  console.log("   Total deposits:", vaultState.totalDeposits.toString());
  console.log("   Total withdrawals:", vaultState.totalWithdrawals.toString());
  console.log("   Total fees:", vaultState.totalFees.toString());
  console.log("   Next index:", vaultState.nextIndex.toString());
  
  const currentRoot = await vault.roots(0);
  console.log("   Current root:", currentRoot.toString());
  console.log();

  // Save addresses to local file
  const addresses = {
    VERIFIER_ADDRESS: verifierAddress,
    POSEIDON_ADDRESS: poseidonAddress,
    VAULT_ADDRESS: vaultAddress,
  };

  const localEnvPath = path.join(__dirname, "..", ".env.local");
  let envContent = "";
  for (const [key, value] of Object.entries(addresses)) {
    envContent += `${key}=${value}\n`;
  }
  fs.writeFileSync(localEnvPath, envContent);

  console.log("✨ Deployment Summary:");
  console.log("━".repeat(62));
  console.log("Verifier:     ", verifierAddress);
  console.log("PoseidonT3:   ", poseidonAddress);
  console.log("PrivateVault: ", vaultAddress);
  console.log("━".repeat(62));
  console.log();
  console.log("💾 Addresses saved to .env.local");
  console.log();
  console.log("🎉 Local deployment complete! Ready to test.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
