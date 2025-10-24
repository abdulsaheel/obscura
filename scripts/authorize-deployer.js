const hre = require("hardhat");

async function main() {
  console.log("🔑 Authorizing deployer for ObscuraFactory...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Authorizing with account:", deployer.address);
  console.log("💰 Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  const factoryAddress = "0x5Cd1572B6865D8641615E7C01fB438218616d695";
  console.log("🏭 Factory address:", factoryAddress);

  // Connect to factory
  const ObscuraFactory = await hre.ethers.getContractFactory("ObscuraFactory");
  const factory = ObscuraFactory.attach(factoryAddress);

  // Check current owner
  const owner = await factory.owner();
  console.log("👤 Current factory owner:", owner);
  console.log("👤 Current signer:", deployer.address);
  
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.error("❌ Error: You are not the owner of the factory.");
    console.error("   Only the factory owner can authorize deployers.");
    process.exit(1);
  }

  // Check if already authorized
  const isAuthorized = await factory.authorizedDeployers(deployer.address);
  if (isAuthorized) {
    console.log("✅ Deployer is already authorized!");
    process.exit(0);
  }

  // Authorize the deployer
  console.log("\n🔐 Authorizing deployer...");
  const authTx = await factory.authorizeDeployer(deployer.address);
  console.log("⏳ Transaction hash:", authTx.hash);
  await authTx.wait();
  
  // Verify authorization
  const nowAuthorized = await factory.authorizedDeployers(deployer.address);
  console.log("✅ Deployer authorized:", nowAuthorized);
  
  console.log("\n🎉 Authorization complete! You can now deploy vaults.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Authorization failed:", error);
    process.exit(1);
  });
