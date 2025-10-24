const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying final test vault through factory...\n");

  // Allow selecting a deployer by index or address via env vars for convenience in multi-signer setups
  const allSigners = await hre.ethers.getSigners();
  let deployer;
  const deployerIndex = process.env.DEPLOYER_INDEX;
  const deployerAddressEnv = process.env.DEPLOYER_ADDRESS;

  if (deployerAddressEnv) {
    // Find signer that matches the provided address
    deployer = allSigners.find(s => s.address.toLowerCase() === deployerAddressEnv.toLowerCase());
    if (!deployer) {
      console.warn(`⚠️ DEPLOYER_ADDRESS ${deployerAddressEnv} not found among Hardhat signers; defaulting to signer[0]`);
      deployer = allSigners[0];
    }
  } else if (deployerIndex) {
    const idx = parseInt(deployerIndex, 10);
    if (isNaN(idx) || idx < 0 || idx >= allSigners.length) {
      console.warn(`⚠️ DEPLOYER_INDEX ${deployerIndex} is invalid; defaulting to signer[0]`);
      deployer = allSigners[0];
    } else {
      deployer = allSigners[idx];
    }
  } else {
    deployer = allSigners[0];
  }

  console.log("📝 Deploying with account:", deployer.address);
  console.log("💰 Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // Contract addresses
  const factoryAddress = "0x5Cd1572B6865D8641615E7C01fB438218616d695";
  const verifierAddress = "0x28B40263C3061ac0Ff3a4E2F8EefBaD04A952de5";
  const poseidonAddress = "0x843af53C69C3953dBE1B0d0eCbF2Eff2E4b23d43";
  const registryAddress = "0x098cb0db955Ba6983B1240a1F356252DCB519847";

  console.log("📋 Using contracts:");
  console.log("   ObscuraFactory:", factoryAddress);
  console.log("   Verifier:", verifierAddress);
  console.log("   PoseidonT3:", poseidonAddress);
  console.log("   IndexerRegistry:", registryAddress);

  // Connect to factory
  const ObscuraFactory = await hre.ethers.getContractFactory("ObscuraFactory");
  const factory = ObscuraFactory.attach(factoryAddress);

  // Ensure signer is authorized (owner can auto-authorize)
  const owner = await factory.owner();
  const isAuthorized = await factory.authorizedDeployers(deployer.address);

  console.log("👤 Factory owner:", owner);
  console.log("👤 Current signer:", deployer.address);
  console.log("🔐 Deployer authorized:", isAuthorized);

  if (!isAuthorized) {
    if (owner.toLowerCase() === deployer.address.toLowerCase()) {
      console.log("🔐 You're the factory owner — authorizing deployer automatically...");
      const authTx = await factory.authorizeDeployer(deployer.address);
      console.log("⏳ Authorize tx:", authTx.hash);
      await authTx.wait();
      console.log("✅ Deployer authorized by owner");
    } else {
      console.error("❌ Error: current signer is not an authorized deployer and you are not the factory owner.");
      console.error("   Options:");
      console.error("   - Run the deploy script with the factory owner account to authorize the deployer first (scripts/authorize-deployer.js)");
      console.error("   - Use an account that is already authorized in the factory.authorizedDeployers mapping");
      process.exit(1);
    }
  }

  // Deploy final test vault
  console.log("\n🏦 Deploying final test vault...");
  // Allow overriding salt via env for deterministic control; otherwise generate unique salt
  const providedSalt = process.env.SALT;
  const salt = providedSalt || hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`FINAL_TEST_VAULT-${deployer.address}-${Date.now()}`));
  console.log('🔐 Using salt:', salt);
  // Diagnostic: check factory on-chain state before calling
  const codeAtFactory = await hre.ethers.provider.getCode(factoryAddress);
  console.log("🔎 Code at factory address length:", codeAtFactory.length);

  try {
    const licenseFeeOnChain = await factory.licenseFee();
    const limitUsed = await factory.deploymentLimits(deployer.address);
    console.log("💸 Factory.licenseFee:", licenseFeeOnChain.toString());
    console.log("📈 deploymentLimits for signer:", limitUsed.toString());
    // Check max deployments allowed
    let maxAllowed = null;
    try {
      maxAllowed = await factory.MAX_DEPLOYMENTS_PER_ADDRESS();
      console.log("📌 Factory.MAX_DEPLOYMENTS_PER_ADDRESS:", maxAllowed.toString());
      if (limitUsed >= maxAllowed) {
        console.error("❌ Deployment limit reached for this signer. deploymentLimits >= MAX_DEPLOYMENTS_PER_ADDRESS");
        console.error("   Options:");
        console.error("   - Use a different deployer account that has deploymentLimits < MAX_DEPLOYMENTS_PER_ADDRESS");
        console.error("   - Ask the factory owner to reset/revoke and re-authorize or deploy using a different account");
        process.exit(1);
      }
    } catch (e) {
      // If the constant isn't accessible, continue but warn
      console.warn("⚠️ Could not read MAX_DEPLOYMENTS_PER_ADDRESS constant:", e.message || e);
    }
  } catch (err) {
    console.warn("⚠️ Could not read factory state (maybe ABI mismatch):", err.message || err);
  }
  // Compute deterministic CREATE2 address for visibility
  try {
    const PrivateVaultFactory = await hre.ethers.getContractFactory('PrivateVault');
    const creationCode = PrivateVaultFactory.bytecode;
    const encodedArgs = hre.ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'address'],
      [verifierAddress, poseidonAddress, factoryAddress]
    );
    const fullBytecode = creationCode + encodedArgs.slice(2);
    const bytecodeHash = hre.ethers.keccak256(fullBytecode);
    const parts = ['0xff', factoryAddress, salt.replace(/^0x/, ''), bytecodeHash.replace(/^0x/, '')];
    const computed = hre.ethers.keccak256('0x' + parts.join(''));
    const computedAddress = '0x' + computed.slice(-40);
    console.log('📌 Will attempt to deploy to CREATE2 address:', computedAddress);
    const codeAtComputed = await hre.ethers.provider.getCode(computedAddress);
    console.log('📦 Code length at target address:', codeAtComputed.length);
  } catch (e) {
    console.warn('⚠️ Could not precompute CREATE2 address:', e.message || e);
  }

  // Prepare transaction (populate) so we can inspect calldata — guard if populateTransaction isn't present
  try {
    if (factory.populateTransaction && typeof factory.populateTransaction.deployOfficialVault === 'function') {
      const populated = await factory.populateTransaction.deployOfficialVault(
        verifierAddress,
        poseidonAddress,
        salt,
        { value: hre.ethers.parseEther("0.1"), gasLimit: 6000000 }
      );

      console.log("📦 Populated tx data length:", populated.data ? populated.data.length : 0);
      // If data missing, print a warning and contract ABI summary
      if (!populated.data || populated.data.length === 0) {
        console.error("❗ Populated transaction has no calldata — this indicates the function selector/ABI may be wrong or the contract at the target address is not the expected factory.");
        console.log("Factory ABI function names:", factory.interface.fragments.filter(f => f.type === 'function').map(f => f.name));
      }
    } else {
      console.warn("⚠️ factory.populateTransaction.deployOfficialVault is not available; skipping populated tx diagnostics.");
    }
  } catch (e) {
    console.warn("⚠️ Failed to populate transaction:", e.message || e);
  }

  const deployTx = await factory.deployOfficialVault(
    verifierAddress,
    poseidonAddress,
    salt,
    { value: hre.ethers.parseEther("0.1"), gasLimit: 6000000 } // License fee
  );
  await deployTx.wait();

  // Get deployment info
  const totalDeployments = await factory.getTotalDeployments();
  const deployment = await factory.getDeploymentInfo(totalDeployments - 1n);
  const vaultAddress = deployment.vault;

  console.log("✅ Final test vault deployed to:", vaultAddress);

  // Verify codehash
  const code = await hre.ethers.provider.getCode(vaultAddress);
  const codeHash = hre.ethers.keccak256(code);
  const canonicalCodeHash = "0x98ea1214d9067670163e1937d5696d2e5571578822801d92e48dbf0a724c669b";

  console.log("🔍 Vault codehash:", codeHash);
  console.log("🎯 Canonical codehash:", canonicalCodeHash);
  console.log("✅ Codehash matches canonical:", codeHash === canonicalCodeHash);

  // Index the vault
  console.log("\n🔗 Indexing final test vault...");
  const PrivateVault = await hre.ethers.getContractFactory("PrivateVault");
  const vault = PrivateVault.attach(vaultAddress);
  const indexTx = await vault.indexWithRegistry(registryAddress);
  await indexTx.wait();
  console.log("✅ Vault indexed successfully");

  // Verify indexing
  const IndexerRegistry = await hre.ethers.getContractFactory("IndexerRegistry");
  const registry = IndexerRegistry.attach(registryAddress);
  const isIndexed = await registry.isVaultIndexed(vaultAddress);
  console.log("🔍 Vault indexed status:", isIndexed);

  console.log("\n✨ Final Test Deployment Summary:");
  console.log("━".repeat(50));
  console.log("Final Test Vault: ", vaultAddress);
  console.log("Codehash Match:   ", codeHash === canonicalCodeHash);
  console.log("Indexed:          ", isIndexed);
  console.log("━".repeat(50));

  console.log("\n🎉 Final test vault deployed and indexed!");
  console.log("📡 The indexer should automatically detect this vault within 30 seconds.");
  console.log("🔍 Check the API at http://localhost:3001/vaults/active to see 3 total vaults.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Final test deployment failed:", error);
    process.exit(1);
  });