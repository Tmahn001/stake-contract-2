import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

async function checkGlobalAccount() {
  // Configure the client to use testnet
  const connection = new anchor.web3.Connection("https://api.testnet.solana.com");
  const programId = new PublicKey("GJiLdyfK4kxXCYXAcwYU4zuSfEgYUvE1jQ3Gg7HXBjdg");
  
  // Global account PDA
  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    programId
  );

  console.log("Program ID:", programId.toString());
  console.log("Global PDA:", globalPda.toString());

  try {
    const accountInfo = await connection.getAccountInfo(globalPda);
    
    if (!accountInfo) {
      console.log("❌ Global account not found");
      return;
    }

    console.log("✅ Global account exists");
    console.log("Account owner:", accountInfo.owner.toString());
    console.log("Account data length:", accountInfo.data.length);
    console.log("Account lamports:", accountInfo.lamports);

    // Parse the account data
    if (accountInfo.data.length >= 104) {
      const data = accountInfo.data;
      
      // Skip discriminator (8 bytes)
      let offset = 8;
      
      // Admin (32 bytes)
      const adminBytes = data.slice(offset, offset + 32);
      const admin = new PublicKey(adminBytes);
      offset += 32;
      
      // Vault (32 bytes)
      const vaultBytes = data.slice(offset, offset + 32);
      const vault = new PublicKey(vaultBytes);
      offset += 32;
      
      // Token mint (32 bytes)
      const mintBytes = data.slice(offset, offset + 32);
      const mint = new PublicKey(mintBytes);
      offset += 32;
      
      // Deposit amount (8 bytes)
      const depositAmountBytes = data.slice(offset, offset + 8);
      const depositAmount = new anchor.BN(depositAmountBytes, 'le');
      offset += 8;
      
      // Default referral cap (1 byte)
      const defaultReferralCap = data[offset];
      offset += 1;
      
      // Min withdrawal (8 bytes)
      const minWithdrawalBytes = data.slice(offset, offset + 8);
      const minWithdrawal = new anchor.BN(minWithdrawalBytes, 'le');
      offset += 8;
      
      // Reentry cooldown (8 bytes)
      const reentryCooldownBytes = data.slice(offset, offset + 8);
      const reentryCooldown = new anchor.BN(reentryCooldownBytes, 'le');
      offset += 8;
      
      // Bump (1 byte)
      const bump = data[offset];
      
      console.log("\n📊 Global Account Data:");
      console.log("- Admin:", admin.toString());
      console.log("- Vault:", vault.toString());
      console.log("- Token Mint:", mint.toString());
      console.log("- Deposit Amount:", depositAmount.toString(), "lamports");
      console.log("- Default Referral Cap:", defaultReferralCap);
      console.log("- Min Withdrawal:", minWithdrawal.toString(), "lamports");
      console.log("- Reentry Cooldown:", reentryCooldown.toString(), "slots");
      console.log("- Bump:", bump);
      
      // Check if mint is a valid token mint
      try {
        const mintInfo = await connection.getAccountInfo(mint);
        if (mintInfo) {
          console.log("\n🔍 Token Mint Info:");
          console.log("- Owner:", mintInfo.owner.toString());
          console.log("- Data Length:", mintInfo.data.length);
          console.log("- Is Token Program?", mintInfo.owner.toString() === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
        } else {
          console.log("\n❌ Token mint account not found");
        }
      } catch (error) {
        console.log("\n❌ Error fetching mint info:", error.message);
      }
    } else {
      console.log("❌ Account data too short:", accountInfo.data.length, "bytes");
    }
    
  } catch (error) {
    console.error("❌ Error checking global account:", error);
  }
}

checkGlobalAccount().catch(console.error);
