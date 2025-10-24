const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const fs = require('fs');

async function test() {
    console.log("🧪 Testing Private Transfer Circuit...");
    
    // Build Poseidon hasher
    const poseidon = await buildPoseidon();
    
    // Test parameters
    const secret = BigInt("123456789");
    const nullifier = BigInt("987654321");
    const amount = BigInt("1000000000000000000"); // 1 ETH in wei
    const protocolFee = BigInt("10000000000000000"); // 0.01 ETH protocol fee
    const recipient = BigInt("0x742d35Cc6639C0532fEb56b9F3a6Da9938302020"); // Example address
    
    // Calculate commitment
    const commitment = poseidon([secret, nullifier, amount]);
    const commitmentStr = poseidon.F.toString(commitment);
    console.log("📝 Commitment:", commitmentStr);
    
    // Create a simple Merkle tree with just one leaf
    const levels = 20;
    const pathElements = new Array(levels).fill(0);
    const pathIndices = new Array(levels).fill(0);
    
    // For a tree with one element, the root equals the commitment
    const root = commitment;
    const rootStr = poseidon.F.toString(root);
    console.log("🌳 Merkle root:", rootStr);
    
    // Calculate nullifier hash
    const nullifierHash = poseidon([secret, nullifier]);
    const nullifierHashStr = poseidon.F.toString(nullifierHash);
    console.log("🔒 Nullifier hash:", nullifierHashStr);
    
    const input = {
        secret: secret.toString(),
        nullifier: nullifier.toString(),
        pathElements: pathElements.map(x => x.toString()),
        pathIndices: pathIndices.map(x => x.toString()),
        root: rootStr,
        nullifierHash: nullifierHashStr,
        recipient: recipient.toString(),
        amount: amount.toString(),
        protocolFee: protocolFee.toString()
    };
    
    console.log("🔍 Circuit input prepared");
    
    try {
        // Check if compiled circuit exists
        const wasmPath = "/tmp/test_circuits/private-transfer_js/private-transfer.wasm";
        const zkeyPath = "../setup/verification_key.json";
        
        if (!fs.existsSync(wasmPath)) {
            throw new Error(`WASM file not found: ${wasmPath}`);
        }
        
        console.log("⚡ Calculating witness...");
        const witness = await snarkjs.wtns.calculate(input, wasmPath);
        
        console.log("✅ Witness calculated successfully!");
        console.log("🎯 Circuit test passed - all constraints satisfied!");
        
        // Display public signals (outputs) - first element is always 1 in circom
        console.log("\n📊 Public signals:");
        console.log("- Nullifier Hash:", witness[1]?.toString() || "N/A");
        console.log("- Root:", witness[2]?.toString() || "N/A"); 
        console.log("- Recipient:", witness[3]?.toString() || "N/A");
        console.log("- Protocol Fee:", witness[4]?.toString() || "N/A");
        console.log("- Amount:", witness[5]?.toString() || "N/A");
        
        // Verify that outputs match expected values
        const expectedNullifierHash = nullifierHashStr;
        const expectedRoot = rootStr;
        const expectedRecipient = recipient.toString();
        const expectedProtocolFee = protocolFee.toString();
        const expectedAmount = amount.toString();
        
        console.log("\n🔍 Verification:");
        console.log("- Nullifier Hash match:", witness[1]?.toString() === expectedNullifierHash ? "✅" : "❌");
        console.log("- Root match:", witness[2]?.toString() === expectedRoot ? "✅" : "❌");
        console.log("- Recipient match:", witness[3]?.toString() === expectedRecipient ? "✅" : "❌");
        console.log("- Protocol Fee match:", witness[4]?.toString() === expectedProtocolFee ? "✅" : "❌");
        console.log("- Amount match:", witness[5]?.toString() === expectedAmount ? "✅" : "❌");
        
    } catch (error) {
        console.error("❌ Circuit test failed:", error.message);
        if (error.message.includes("Error in constraint")) {
            console.error("🚫 Constraint violation detected - circuit logic error");
        }
    }
}

test().catch(console.error);