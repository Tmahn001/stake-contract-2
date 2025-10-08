import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

async function initialize() {
  // Configure the client to use testnet
  const connection = new anchor.web3.Connection("https://api.testnet.solana.com");
  const wallet = anchor.AnchorProvider.env().wallet;
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  anchor.setProvider(provider);

  const programId = new PublicKey("8KKR4acn2mVzmcCzD3jRHBv5i8oXWEhSAbvpSWh1pMhv");
  
  console.log("=== USDC Referral Distributor Initialization ===");
  console.log("Program ID:", programId.toString());
  console.log("Admin wallet:", provider.wallet.publicKey.toString());

  // Using Wrapped SOL for testing (more reliable than USDC on testnet)
  const mint = new PublicKey("So11111111111111111111111111111111111111112"); // Wrapped SOL (WSOL)
  
  // Use admin's wallet as vault for simplicity (in production, create proper vault)
  const vault = provider.wallet.publicKey;

  // Global account PDA
  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    programId
  );

  // Reserve wallet (using admin for simplicity)
  const reserve = provider.wallet.publicKey;

  // Initialize parameters for WSOL (using WSOL decimals: 9)
  const depositAmount = new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL); // 0.1 WSOL
  const defaultReferralCap = 10;
  const minWithdrawal = new anchor.BN(0.01 * anchor.web3.LAMPORTS_PER_SOL); // 0.01 WSOL

  console.log("\n📊 Initialization Parameters:");
  console.log("- Token Mint (WSOL):", mint.toString());
  console.log("- Vault:", vault.toString());
  console.log("- Reserve:", reserve.toString());
  console.log("- Deposit Amount:", depositAmount.toString(), "lamports (0.1 WSOL)");
  console.log("- Default Referral Cap:", defaultReferralCap);
  console.log("- Min Withdrawal:", minWithdrawal.toString(), "lamports (0.01 WSOL)");
  console.log("- Global PDA:", globalPda.toString());

  // Check if global account already exists
  try {
    const existingAccount = await connection.getAccountInfo(globalPda);
    if (existingAccount) {
      console.log("\n⚠️  Global account already exists!");
      console.log("Account owner:", existingAccount.owner.toString());
      console.log("Account data length:", existingAccount.data.length);
      
      if (existingAccount.owner.toString() !== programId.toString()) {
        console.log("❌ Account is owned by different program. This is not our global account.");
        return;
      }
      
      console.log("✅ This is our global account. Skipping initialization.");
      return;
    }
  } catch (error) {
    console.log("Global account doesn't exist, proceeding with initialization...");
  }

  console.log("\n🚀 Creating initialize instruction...");

  // Create initialize instruction manually
  const initializeIx = new anchor.web3.TransactionInstruction({
    programId: programId,
    keys: [
      { pubkey: globalPda, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: reserve, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]), // initialize discriminator
      depositAmount.toBuffer('le', 8),
      Buffer.from([defaultReferralCap]),
      minWithdrawal.toBuffer('le', 8),
    ])
  });

  try {
    console.log("📤 Sending transaction...");
    const tx = new anchor.web3.Transaction().add(initializeIx);
    const signature = await provider.sendAndConfirm(tx);

    console.log("\n✅ USDC initialization successful!");
    console.log("Transaction signature:", signature);
    console.log("Global PDA:", globalPda.toString());
    console.log("Token mint:", mint.toString());
    
    // Verify the account was created correctly
    console.log("\n🔍 Verifying initialization...");
    const accountInfo = await connection.getAccountInfo(globalPda);
    if (accountInfo) {
      console.log("✅ Global account created successfully");
      console.log("Account owner:", accountInfo.owner.toString());
      console.log("Account data length:", accountInfo.data.length);
      
      // Parse and display the stored token mint
      if (accountInfo.data.length >= 104) {
        const mintBytes = accountInfo.data.slice(72, 104);
        const storedMint = new PublicKey(mintBytes);
        console.log("Stored token mint:", storedMint.toString());
        
        if (storedMint.toString() === mint.toString()) {
          console.log("✅ Token mint matches WSOL address");
        } else {
          console.log("❌ Token mint mismatch!");
        }
      }
    } else {
      console.log("❌ Failed to verify account creation");
    }
    
  } catch (error) {
    console.error("\n❌ USDC initialization failed:", error);
    
    if (error.logs) {
      console.log("\n📋 Transaction logs:");
      error.logs.forEach((log, i) => console.log(`${i + 1}. ${log}`));
    }
  }
}

initialize().catch(console.error);
