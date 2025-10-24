const hre = require("hardhat");

async function main() {
  const vaultAddress = "0x3D2345aCEe9F608A9eC1CEe5B65041d2BDB47daB";

  console.log("🔍 Checking vault status:", vaultAddress);

  const vault = await hre.ethers.getContractAt("PrivateVault", vaultAddress);

  // Check if paused
  const paused = await vault.paused();
  console.log("⏸️  Paused:", paused);

  // Check emergency pause
  const emergencyPaused = await vault.isEmergencyPaused();
  console.log("🚨 Emergency Paused:", emergencyPaused);

  // Check balance
  const balance = await vault.getBalance();
  console.log("💰 Balance:", hre.ethers.formatEther(balance), "ETH");

  // Check statistics
  const stats = await vault.getStatistics();
  console.log("📊 Stats:", {
    deposits: stats[0].toString(),
    withdrawals: stats[1].toString(),
    fees: stats[2].toString(),
    nextIndex: stats[3].toString(),
    currentRoot: stats[4].toString()
  });

  // Check verifier address
  const verifier = await vault.verifier();
  console.log("🔐 Verifier:", verifier);

  // Check hasher address
  const hasher = await vault.hasher();
  console.log("🔄 Hasher:", hasher);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });