const hre = require("hardhat");

async function main() {
  console.log('🔎 Running callStatic.deployOfficialVault to capture revert reason (simulated)');

  const signers = await hre.ethers.getSigners();
  // Use signer index 1 which you tried earlier (adjust if needed)
  const signer = signers[1] || signers[0];
  console.log('👤 Using signer:', signer.address);

  const factoryAddress = "0x5Cd1572B6865D8641615E7C01fB438218616d695";
  const ObscuraFactory = await hre.ethers.getContractFactory("ObscuraFactory");
  const factory = ObscuraFactory.attach(factoryAddress).connect(signer);
  console.log('Factory ABI function names:', factory.interface.fragments.filter(f => f.type === 'function').map(f => f.name));
  console.log('callStatic keys:', Object.keys(factory.callStatic || {}));

  const verifier = "0x28B40263C3061ac0Ff3a4E2F8EefBaD04A952de5";
  const poseidon = "0x843af53C69C3953dBE1B0d0eCbF2Eff2E4b23d43";
  const salt = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("FINAL_TEST_VAULT"));

  try {
    // Fallback: encode calldata and run a provider.call (eth_call) to capture revert data
    const iface = factory.interface;
    const calldata = iface.encodeFunctionData('deployOfficialVault', [verifier, poseidon, salt]);
    console.log('Calldata length:', calldata.length);
    // Check that verifier and hasher have deployed code
    const codeVerifier = await hre.ethers.provider.getCode(verifier);
    const codeHasher = await hre.ethers.provider.getCode(poseidon);
    console.log('Verifier code length:', codeVerifier.length);
    console.log('Poseidon hasher code length:', codeHasher.length);

    // Compute the CREATE2 address the factory will attempt to deploy to and check if it already exists
    try {
      const PrivateVaultFactory = await hre.ethers.getContractFactory('PrivateVault');
      const creationCode = PrivateVaultFactory.bytecode; // 0x...
      const encodedArgs = hre.ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'address'],
        [verifier, poseidon, factoryAddress]
      );
      const fullBytecode = creationCode + encodedArgs.slice(2);
      const bytecodeHash = hre.ethers.keccak256(fullBytecode);
      // salt must be bytes32
      const saltHex = salt.startsWith('0x') ? salt : hre.ethers.keccak256(salt);
      const parts = ['0xff', factoryAddress, saltHex, bytecodeHash].map(p => p.replace(/^0x/, ''));
      const computed = hre.ethers.keccak256('0x' + parts.join(''));
      const computedAddress = '0x' + computed.slice(-40);
      console.log('Computed CREATE2 address for this vault:', computedAddress);
      const codeAtComputed = await hre.ethers.provider.getCode(computedAddress);
      console.log('Code length at computed address:', codeAtComputed.length);
    } catch (e) {
      console.warn('Could not compute CREATE2 address:', e && e.message ? e.message : e);
    }

    try {
      const callResult = await hre.ethers.provider.call({
        to: factoryAddress,
        data: calldata,
        value: hre.ethers.parseEther('0.1')
      });

      console.log('callResult (hex):', callResult);
      console.log('✅ eth_call returned data (no revert)');
    } catch (callErr) {
      console.error('eth_call reverted — details:');
      // Try to extract revert reason from the returned error
      const data = callErr.error && (callErr.error.data || callErr.error.body) || callErr.data || callErr.body || callErr;
      console.error('raw call error:', data);

      // If we can find a revert hex string, attempt to decode it
      const maybeHex = (typeof data === 'string' && data.startsWith('0x')) ? data : (data && data.startsWith && data.startsWith('0x') ? data : null);
      if (maybeHex) {
        try {
          // ABI for Error(string) is 0x08c379a0 + encoding
          const abiCoder = new hre.ethers.AbiCoder();
          // strip selector (4 bytes -> 8 chars after 0x)
          const reason = abiCoder.decode(['string'], '0x' + maybeHex.slice(10));
          console.error('Revert reason decoded:', reason[0]);
        } catch (decErr) {
          console.warn('Failed to decode revert reason:', decErr);
        }
      }
    }
  } catch (err) {
    console.error('❌ callStatic reverted — error/insight below:');
    // Print both err.message and the whole error for deeper introspection
    console.error(err && err.message ? err.message : err);
    console.error('Full error object:', err);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
