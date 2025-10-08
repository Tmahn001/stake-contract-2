import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { ReferralDistributor } from "../target/types/referral_distributor";

async function initialize() {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.AnchorProvider.env();
  const program = anchor.workspace.ReferralDistributor as Program<ReferralDistributor>;

  console.log("Program ID:", program.programId.toString());
  console.log("Admin wallet:", provider.wallet.publicKey.toString());

  // Create a test token mint (or use existing one)
  console.log("Creating test token mint...");
  const mint = await createMint(
    provider.connection,
    provider.wallet.payer,
    provider.wallet.publicKey, // mint authority
    provider.wallet.publicKey, // freeze authority
    9 // decimals
  );
  console.log("Token mint created:", mint.toString());

  // Create vault token account
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    program.programId
  );

  const vaultTokenAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    provider.wallet.payer,
    mint,
    vaultPda,
    true // allowOwnerOffCurve
  );
  console.log("Vault token account:", vaultTokenAccount.address.toString());

  // Global account PDA
  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );

  // Reserve wallet (can be any address, using admin for simplicity)
  const reserve = provider.wallet.publicKey;

  // Initialize parameters
  const depositAmount = new anchor.BN(1 * LAMPORTS_PER_SOL); // 1 SOL
  const defaultReferralCap = 10;
  const minWithdrawal = new anchor.BN(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL

  console.log("Initializing global account...");
  console.log("- Deposit amount:", depositAmount.toString(), "lamports (1 SOL)");
  console.log("- Default referral cap:", defaultReferralCap);
  console.log("- Min withdrawal:", minWithdrawal.toString(), "lamports (0.1 SOL)");

  try {
    const tx = await program.methods
      .initialize(depositAmount, defaultReferralCap, minWithdrawal)
      .accounts({
        global: globalPda,
        vault: vaultTokenAccount.address,
        mint: mint,
        admin: provider.wallet.publicKey,
        reserve: reserve,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("✅ Initialization successful!");
    console.log("Transaction signature:", tx);
    console.log("Global PDA:", globalPda.toString());
    
    // Fetch and display the initialized account
    const globalAccount = await program.account.global.fetch(globalPda);
    console.log("\n📋 Global Account Details:");
    console.log("- Admin:", globalAccount.admin.toString());
    console.log("- Reserve:", globalAccount.reserve.toString());
    console.log("- Vault:", globalAccount.vault.toString());
    console.log("- Token Mint:", globalAccount.tokenMint.toString());
    console.log("- Deposit Amount:", globalAccount.depositAmount.toString());
    console.log("- Default Referral Cap:", globalAccount.defaultReferralCap);
    console.log("- Min Withdrawal:", globalAccount.minWithdrawal.toString());
    console.log("- Reserve Pool:", globalAccount.reservePool.toString());
    console.log("- Reentry Cooldown:", globalAccount.reentryCooldown.toString());

  } catch (error) {
    console.error("❌ Initialization failed:", error);
    
    // Check if account already exists
    try {
      const existingAccount = await program.account.global.fetch(globalPda);
      console.log("ℹ️  Global account already exists:");
      console.log("- Admin:", existingAccount.admin.toString());
      console.log("- Token Mint:", existingAccount.tokenMint.toString());
    } catch (fetchError) {
      console.log("Global account doesn't exist yet");
    }
  }
}

initialize().catch(console.error);
