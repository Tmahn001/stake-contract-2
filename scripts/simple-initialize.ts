import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

async function initialize() {
  // Configure the client to use testnet
  const connection = new anchor.web3.Connection("https://api.testnet.solana.com");
  const wallet = anchor.AnchorProvider.env().wallet;
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  anchor.setProvider(provider);

  const programId = new PublicKey("GJiLdyfK4kxXCYXAcwYU4zuSfEgYUvE1jQ3Gg7HXBjdg");
  
  console.log("Program ID:", programId.toString());
  console.log("Admin wallet:", provider.wallet.publicKey.toString());

  // For now, use a dummy token mint (you can replace with actual token later)
  const mint = new PublicKey("So11111111111111111111111111111111111111112"); // Wrapped SOL
  
  // Use admin's wallet as vault for simplicity (in production, create proper vault)
  const vault = provider.wallet.publicKey;

  // Global account PDA
  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    programId
  );

  // Reserve wallet (using admin for simplicity)
  const reserve = provider.wallet.publicKey;

  // Initialize parameters
  const depositAmount = new anchor.BN(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL for testing
  const defaultReferralCap = 10;
  const minWithdrawal = new anchor.BN(0.01 * LAMPORTS_PER_SOL); // 0.01 SOL

  console.log("Initializing global account...");
  console.log("- Deposit amount:", depositAmount.toString(), "lamports (0.1 SOL)");
  console.log("- Default referral cap:", defaultReferralCap);
  console.log("- Min withdrawal:", minWithdrawal.toString(), "lamports (0.01 SOL)");

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
    const tx = new anchor.web3.Transaction().add(initializeIx);
    const signature = await provider.sendAndConfirm(tx);

    console.log("✅ Initialization successful!");
    console.log("Transaction signature:", signature);
    console.log("Global PDA:", globalPda.toString());
    
  } catch (error) {
    console.error("❌ Initialization failed:", error);
    
    // Check if account already exists
    try {
      const accountInfo = await connection.getAccountInfo(globalPda);
      if (accountInfo) {
        console.log("ℹ️  Global account already exists");
        console.log("Account owner:", accountInfo.owner.toString());
        console.log("Account data length:", accountInfo.data.length);
      }
    } catch (fetchError) {
      console.log("Could not fetch account info");
    }
  }
}

initialize().catch(console.error);
