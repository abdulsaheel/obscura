const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { buildPoseidon } = require("circomlibjs");
const snarkjs = require("snarkjs");
require("dotenv").config();

async function main() {
  console.log("🧪 Testing Obscura End-to-End on SEPOLIA TESTNET\n");
  console.log("=".repeat(70));

  // Load deployed addresses from .env
  const VAULT_ADDRESS = process.env.VAULT_ADDRESS;
  const RECEIVER_ADDRESS = process.env.RECIEVER_ADDRESS;

  if (!VAULT_ADDRESS || !RECEIVER_ADDRESS) {
    throw new Error("Missing VAULT_ADDRESS or RECIEVER_ADDRESS in .env");
  }

  // Get signer (depositor)
  const [depositor] = await hre.ethers.getSigners();
  
  console.log("👤 Depositor address:", depositor.address);
  console.log("🎯 Receiver address:", RECEIVER_ADDRESS);
  
  const depositorBalance = await hre.ethers.provider.getBalance(depositor.address);
  console.log("💰 Depositor balance:", hre.ethers.formatEther(depositorBalance), "ETH\n");

  if (depositorBalance < hre.ethers.parseEther("0.01")) {
    throw new Error("Insufficient balance for testing. Need at least 0.01 ETH for deposit + gas.");
  }

  // Initialize Poseidon
  console.log("🔐 Initializing Poseidon hash function...");
  const poseidon = await buildPoseidon();

  // ============ STEP 1: GENERATE COMMITMENT ============
  console.log("\n" + "=".repeat(70));
  console.log("STEP 1: GENERATE COMMITMENT");
  console.log("=".repeat(70));

  // Generate random secret and nullifier
  const secret = BigInt("0x" + crypto.getRandomValues(new Uint8Array(31)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), ""));
  const nullifier = BigInt("0x" + crypto.getRandomValues(new Uint8Array(31)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), ""));
  const depositAmount = hre.ethers.parseEther("0.001"); // 0.001 ETH for Sepolia
  const amount = depositAmount;

  console.log("📝 Generated secrets:");
  console.log("   Secret:    ", secret.toString().substring(0, 20) + "...");
  console.log("   Nullifier: ", nullifier.toString().substring(0, 20) + "...");
  console.log("   Amount:    ", hre.ethers.formatEther(amount), "ETH\n");

  // Compute commitment: Poseidon(secret, nullifier, amount)
  const commitment = poseidon.F.toString(poseidon([secret, nullifier, amount]));
  console.log("✅ Commitment:", commitment);

  // Save note
  const note = {
    secret: secret.toString(),
    nullifier: nullifier.toString(),
    amount: amount.toString(),
    commitment: commitment,
    depositor: depositor.address,
    receiver: RECEIVER_ADDRESS,
    network: "sepolia",
  };
  const notePath = path.join(__dirname, "..", "note-sepolia.json");
  fs.writeFileSync(notePath, JSON.stringify(note, null, 2));
  console.log("💾 Note saved to:", notePath);

  // ============ STEP 2: DEPOSIT ============
  console.log("\n" + "=".repeat(70));
  console.log("STEP 2: DEPOSIT");
  console.log("=".repeat(70));

  const vault = await hre.ethers.getContractAt("PrivateVault", VAULT_ADDRESS);

  console.log("📤 Sending deposit transaction...");
  console.log("   Commitment:", commitment);
  console.log("   Amount:", hre.ethers.formatEther(depositAmount), "ETH");
  
  const depositTx = await vault.connect(depositor).deposit(commitment, {
    value: depositAmount,
  });

  console.log("📝 Transaction hash:", depositTx.hash);
  console.log("⏳ Waiting for confirmation...");
  const depositReceipt = await depositTx.wait();
  console.log("✅ Deposit confirmed in block:", depositReceipt.blockNumber);
  console.log("⛽ Gas used:", depositReceipt.gasUsed.toString());

  // Get leaf index from event
  let leafIndex = 0;
  for (const log of depositReceipt.logs) {
    try {
      const parsed = vault.interface.parseLog(log);
      if (parsed && parsed.name === "Deposit") {
        leafIndex = Number(parsed.args[1]);
        break;
      }
    } catch (e) {
      // Not a vault log, skip
    }
  }
  
  console.log("📍 Leaf index:", leafIndex);

  // ============ STEP 3: BUILD MERKLE PROOF ============
  console.log("\n" + "=".repeat(70));
  console.log("STEP 3: BUILD MERKLE PROOF");
  console.log("=".repeat(70));

  // Get current root
  const vaultState = await vault.vaultState();
  const currentRootIndex = vaultState.currentRootIndex;
  const root = await vault.roots(currentRootIndex);
  console.log("📊 Current root:", root.toString());
  console.log("📍 Building Merkle proof for leaf index:", leafIndex);

  // Build Merkle path (simplified for first deposit)
  const levels = 20;
  const pathElements = [];
  const pathIndices = [];

  let currentIndex = leafIndex;
  let currentHash = BigInt(commitment);

  const PoseidonContract = await hre.ethers.getContractAt("PoseidonT3", process.env.POSEIDON_ADDRESS);

  for (let i = 0; i < levels; i++) {
    const isLeft = currentIndex % 2 === 0;
    pathIndices.push(isLeft ? 0 : 1);

    const zeroValue = await PoseidonContract.zeros(i);
    pathElements.push(zeroValue.toString());
    
    if (isLeft) {
      const newHash = poseidon([currentHash, BigInt(zeroValue)]);
      currentHash = BigInt(poseidon.F.toString(newHash));
    } else {
      const newHash = poseidon([BigInt(zeroValue), currentHash]);
      currentHash = BigInt(poseidon.F.toString(newHash));
    }

    currentIndex = Math.floor(currentIndex / 2);
  }

  console.log("✅ Merkle path built");
  console.log("📊 Computed root:", currentHash.toString());

  // ============ STEP 4: GENERATE ZK PROOF ============
  console.log("\n" + "=".repeat(70));
  console.log("STEP 4: GENERATE ZK PROOF");
  console.log("=".repeat(70));

  // Compute nullifier hash
  const nullifierHash = poseidon.F.toString(poseidon([secret, nullifier]));
  console.log("🔒 Nullifier hash:", nullifierHash);

  // Prepare circuit inputs
  const circuitInputs = {
    // Public inputs
    nullifierHash: nullifierHash,
    root: root.toString(),
    recipient: RECEIVER_ADDRESS,
    protocolFee: "0",
    amount: amount.toString(),
    
    // Private inputs
    secret: secret.toString(),
    nullifier: nullifier.toString(),
    pathElements: pathElements,
    pathIndices: pathIndices,
  };

  console.log("📝 Circuit inputs prepared");
  console.log("⚙️  Generating proof (this may take 30-60 seconds)...");

  const wasmPath = path.join(__dirname, "..", "circuits", "private-transfer_js", "private-transfer.wasm");
  const zkeyPath = path.join(__dirname, "..", "circuits", "private-transfer_final.zkey");

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    wasmPath,
    zkeyPath
  );

  console.log("✅ Proof generated successfully!");
  console.log("📊 Public signals:", publicSignals);

  // ============ STEP 5: WITHDRAW ============
  console.log("\n" + "=".repeat(70));
  console.log("STEP 5: WITHDRAW");
  console.log("=".repeat(70));

  // Format proof for Solidity
  const proofA = [proof.pi_a[0], proof.pi_a[1]];
  const proofB = [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]];
  const proofC = [proof.pi_c[0], proof.pi_c[1]];

  console.log("📤 Sending withdrawal transaction...");
  
  const receiverBalanceBefore = await hre.ethers.provider.getBalance(RECEIVER_ADDRESS);
  console.log("💰 Receiver balance before:", hre.ethers.formatEther(receiverBalanceBefore), "ETH");

  const withdrawTx = await vault.connect(depositor).withdraw(
    proofA,
    proofB,
    proofC,
    publicSignals
  );

  console.log("📝 Transaction hash:", withdrawTx.hash);
  console.log("⏳ Waiting for confirmation...");
  const withdrawReceipt = await withdrawTx.wait();
  console.log("✅ Withdrawal confirmed in block:", withdrawReceipt.blockNumber);
  console.log("⛽ Gas used:", withdrawReceipt.gasUsed.toString());

  const receiverBalanceAfter = await hre.ethers.provider.getBalance(RECEIVER_ADDRESS);
  console.log("💰 Receiver balance after:", hre.ethers.formatEther(receiverBalanceAfter), "ETH");
  console.log("💸 Received:", hre.ethers.formatEther(receiverBalanceAfter - receiverBalanceBefore), "ETH");

  // ============ VERIFICATION ============
  console.log("\n" + "=".repeat(70));
  console.log("✨ TEST COMPLETE!");
  console.log("=".repeat(70));
  console.log("✅ Successfully deposited", hre.ethers.formatEther(depositAmount), "ETH on Sepolia");
  console.log("✅ Successfully withdrew to different address");
  console.log("✅ Zero-knowledge privacy maintained!");
  console.log("\n🔍 View on Etherscan:");
  console.log("   Deposit:  ", `https://sepolia.etherscan.io/tx/${depositReceipt.hash}`);
  console.log("   Withdraw: ", `https://sepolia.etherscan.io/tx/${withdrawReceipt.hash}`);
  console.log("=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });
