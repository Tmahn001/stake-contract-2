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

  // USDC mint address on Solana testnet
  const mint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"); // USDC Testnet
  
  // Use admin's wallet as vault for simplicity (in production, create proper vault)
  const vault = provider.wallet.publicKey;

  // Global account PDA
  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    programId
  );

  // Reserve wallet (using admin for simplicity)
  const reserve = provider.wallet.publicKey;

  // Initialize parameters for USDC (using USDC decimals: 6)
  const depositAmount = new anchor.BN(100000); // 0.1 USDC (100000 micro-USDC)
  const defaultReferralCap = 10;
  const minWithdrawal = new anchor.BN(10000); // 0.01 USDC (10000 micro-USDC)

  console.log("Initializing global account with USDC...");
  console.log("- Deposit amount:", depositAmount.toString(), "micro-USDC (0.1 USDC)");
  console.log("- Default referral cap:", defaultReferralCap);
  console.log("- Min withdrawal:", minWithdrawal.toString(), "micro-USDC (0.01 USDC)");
  console.log("- Token mint:", mint.toString());

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

    console.log("✅ USDC initialization successful!");
    console.log("Transaction signature:", signature);
    console.log("Global PDA:", globalPda.toString());
    console.log("Token mint:", mint.toString());
    
  } catch (error) {
    console.error("❌ USDC initialization failed:", error);
    
    // Check if account already exists
    try {
      const accountInfo = await connection.getAccountInfo(globalPda);
      if (accountInfo) {
        console.log("ℹ️  Global account already exists");
        console.log("Account owner:", accountInfo.owner.toString());
        console.log("Account data length:", accountInfo.data.length);
        
        // Show current token mint
        if (accountInfo.data.length >= 104) {
          const currentMintBytes = accountInfo.data.slice(72, 104);
          const currentMint = new PublicKey(currentMintBytes);
          console.log("Current token mint:", currentMint.toString());
        }
      }
    } catch (fetchError) {
      console.log("Could not fetch account info");
    }
  }
}

initialize().catch(console.error);
