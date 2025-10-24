const hre = require("hardhat");

async function main() {
  console.log("🧪 Testing deposit to vault...");

  const vaultAddress = "0x3D2345aCEe9F608A9eC1CEe5B65041d2BDB47daB";

  const [depositor] = await hre.ethers.getSigners();
  console.log("👤 Depositor:", depositor.address);

  const vault = await hre.ethers.getContractAt("PrivateVault", vaultAddress);

  // Generate a simple commitment (just for testing)
  const commitment = hre.ethers.toBigInt(hre.ethers.keccak256("0x1234567890abcdef"));
  console.log("📝 Commitment:", commitment.toString());

  const depositAmount = hre.ethers.parseEther("0.001");
  console.log("💰 Amount:", hre.ethers.formatEther(depositAmount), "ETH");

  try {
    console.log("📤 Attempting deposit...");
    const tx = await vault.connect(depositor).deposit(commitment, {
      value: depositAmount
    });

    console.log("⏳ Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log("✅ Deposit successful! TX:", receipt.hash);

  } catch (error) {
    console.error("❌ Deposit failed:", error);

    // Try to get more details
    if (error.data) {
      console.log("📄 Error data:", error.data);
    }
    if (error.reason) {
      console.log("📄 Error reason:", error.reason);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });