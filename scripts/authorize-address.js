const hre = require("hardhat");

async function main() {
  const target = process.argv[2] || process.env.TARGET_ADDRESS;
  if (!target) {
    console.error("Usage: node scripts/authorize-address.js <address>\nOr set TARGET_ADDRESS env var");
    process.exit(1);
  }

  console.log(`🔑 Authorizing address ${target} on the factory`);

  const [ownerSigner] = await hre.ethers.getSigners();
  const factoryAddress = process.env.FACTORY_ADDRESS || "0x5Cd1572B6865D8641615E7C01fB438218616d695";

  const ObscuraFactory = await hre.ethers.getContractFactory("ObscuraFactory");
  const factory = ObscuraFactory.attach(factoryAddress).connect(ownerSigner);

  const owner = await factory.owner();
  if (owner.toLowerCase() !== ownerSigner.address.toLowerCase()) {
    console.error("❌ Current signer is not the factory owner. Run this script with the owner account.");
    process.exit(1);
  }

  console.log("👤 Factory owner:", owner);
  console.log("👤 Running as:", ownerSigner.address);

  const tx = await factory.authorizeDeployer(target);
  console.log("⏳ Tx:", tx.hash);
  await tx.wait();
  console.log("✅ Authorized:", target);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Authorization failed:", err);
    process.exit(1);
  });
