const hre = require("hardhat");

async function main() {
  const vaultAddress = "0x92C29816e2c3507eFE5825F98B6E5cb5514d7e2b";

  console.log("🔍 Checking codehash for vault:", vaultAddress);

  // Get the code
  const code = await hre.ethers.provider.getCode(vaultAddress);
  console.log("📄 Code length:", code.length);

  // Calculate codehash
  const codeHash = hre.ethers.keccak256(code);
  console.log("🔢 Vault codehash:", codeHash);

  // Compare with canonical
  const canonicalCodeHash = "0x98ea1214d9067670163e1937d5696d2e5571578822801d92e48dbf0a724c669b";
  console.log("🎯 Canonical codehash:", canonicalCodeHash);
  console.log("✅ Match:", codeHash === canonicalCodeHash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });