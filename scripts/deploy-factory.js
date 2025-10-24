const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying ObscuraFactory for deterministic vault deployment...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);
  console.log("💰 Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // Use the fresh contract addresses
  const verifierAddress = process.env.VERIFIER_ADDRESS || "0x28B40263C3061ac0Ff3a4E2F8EefBaD04A952de5";
  const poseidonAddress = process.env.POSEIDON_ADDRESS || "0x843af53C69C3953dBE1B0d0eCbF2Eff2E4b23d43";

  console.log("📋 Using contracts:");
  console.log("   Verifier:", verifierAddress);
  console.log("   PoseidonT3:", poseidonAddress);

  // Deploy ObscuraFactory
  console.log("\n🏭 Deploying ObscuraFactory...");
  const ObscuraFactory = await hre.ethers.getContractFactory("ObscuraFactory");
  const factory = await ObscuraFactory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("✅ ObscuraFactory deployed to:", factoryAddress);

  // Authorize the deployer
  console.log("\n🔑 Authorizing deployer...");
  const authTx = await factory.authorizeDeployer(deployer.address);
  await authTx.wait();
  console.log("✅ Deployer authorized");

  // Test deterministic deployment - deploy two vaults with same salt
  console.log("\n🏦 Testing deterministic deployment...");

  const salt1 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("TEST_VAULT_1"));
  const salt2 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("TEST_VAULT_2"));

  // Deploy first vault
  console.log("   Deploying vault 1...");
  const deployTx1 = await factory.deployOfficialVault(
    verifierAddress,
    poseidonAddress,
    salt1,
    { value: hre.ethers.parseEther("0.1") } // License fee
  );
  await deployTx1.wait();
  const vault1Address = await factory.deployments(0);
  console.log("   ✅ Vault 1 deployed to:", vault1Address.vault);

  // Deploy second vault
  console.log("   Deploying vault 2...");
  const deployTx2 = await factory.deployOfficialVault(
    verifierAddress,
    poseidonAddress,
    salt2,
    { value: hre.ethers.parseEther("0.1") } // License fee
  );
  await deployTx2.wait();
  const vault2Address = await factory.deployments(1);
  console.log("   ✅ Vault 2 deployed to:", vault2Address.vault);

  // Check codehashes
  console.log("\n🔍 Checking codehashes...");
  const code1 = await hre.ethers.provider.getCode(vault1Address.vault);
  const codeHash1 = hre.ethers.keccak256(code1);
  console.log("   Vault 1 codehash:", codeHash1);

  const code2 = await hre.ethers.provider.getCode(vault2Address.vault);
  const codeHash2 = hre.ethers.keccak256(code2);
  console.log("   Vault 2 codehash:", codeHash2);

  console.log("   ✅ Same codehash:", codeHash1 === codeHash2);

  console.log("\n✨ Factory Deployment Summary:");
  console.log("━".repeat(50));
  console.log("ObscuraFactory: ", factoryAddress);
  console.log("Vault 1:        ", vault1Address.vault);
  console.log("Vault 2:        ", vault2Address.vault);
  console.log("Same Codehash:  ", codeHash1 === codeHash2);
  console.log("━".repeat(50));

  console.log("\n🎉 Factory deployed! Now vaults have deterministic bytecode.");
  console.log("📡 All official vaults will have the same codehash for indexing.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Factory deployment failed:", error);
    process.exit(1);
  });