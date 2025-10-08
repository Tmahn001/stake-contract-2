use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};

declare_id!("8KKR4acn2mVzmcCzD3jRHBv5i8oXWEhSAbvpSWh1pMhv");

#[program]
pub mod referral_distributor {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        deposit_amount: u64,
        default_referral_cap: u8,
        min_withdrawal: u64,
    ) -> Result<()> {
        let g = &mut ctx.accounts.global;
        g.admin = *ctx.accounts.admin.key;
        g.reserve = *ctx.accounts.reserve.key;
        g.vault = *ctx.accounts.vault.key;
        g.token_mint = *ctx.accounts.mint.to_account_info().key;
        g.deposit_amount = deposit_amount;
        g.default_referral_cap = default_referral_cap;
        g.min_withdrawal = min_withdrawal;
        g.reserve_pool = 0;
        g.reentry_cooldown = 30 * 24 * 3600; // 30 days default
        g.bump = ctx.bumps.global;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, maybe_referrer: Option<Pubkey>) -> Result<()> {
        let g = &mut ctx.accounts.global;
        let user = &mut ctx.accounts.user;

        require!(g.deposit_amount > 0, ErrorCode::InvalidDepositAmount);

        // Prevent repeat deposits unless cooldown expired
        if user.has_deposited {
            let now = Clock::get()?.unix_timestamp;
            require!(
                now >= user.last_deposit + g.reentry_cooldown as i64,
                ErrorCode::CooldownActive
            );
        }

        // transfer tokens from user's ATA → vault ATA
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.user_authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, g.deposit_amount)?;

        // Register user
        if !user.registered {
            user.registered = true;
            user.owner = *ctx.accounts.user_authority.key;
            user.referral_cap = g.default_referral_cap;
            user.has_deposited = false;
            user.last_deposit = 0;
            user.referrer = Pubkey::default();
            user.referrals = Vec::new();
            user.balance = 0;
            user.total_earned = 0;
            user.total_referrals = 0;
            user.legacy_flag = false;
        }

        // Link referrer
        if user.referrer == Pubkey::default() {
            if let Some(ref_pk) = maybe_referrer {
                require!(ref_pk != user.key(), ErrorCode::InvalidReferrer);
                // For simplicity, just set the referrer without complex validation
                // In production, you'd want to validate the referrer account exists
                user.referrer = ref_pk;
            }
        }

        // Update deposit flags
        user.has_deposited = true;
        user.last_deposit = Clock::get()?.unix_timestamp;
        
        // Simplified distribution logic
        let amount = g.deposit_amount;
        
        // Give user a small bonus for depositing
        let user_bonus = amount / 20; // 5% bonus
        user.balance = user.balance.checked_add(user_bonus).unwrap_or(user.balance);
        user.total_earned = user.total_earned.checked_add(user_bonus).unwrap_or(user.total_earned);
        
        // Rest goes to reserve pool for now
        let to_reserve = amount.checked_sub(user_bonus).unwrap_or(0);
        g.reserve_pool = g.reserve_pool.checked_add(to_reserve).unwrap_or(g.reserve_pool);

        emit!(DepositEvent {
            sender: user.owner,
            amount,
        });

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let user = &mut ctx.accounts.user;
        let g = &ctx.accounts.global;
        require!(
            user.balance >= g.min_withdrawal,
            ErrorCode::BelowMinWithdrawal
        );

        let amount = user.balance;
        let user_owner = user.owner;
        user.balance = 0;

        // transfer from vault to user ATA (CPI) — left as helper implementation
        do_transfer_from_vault_to_user(&ctx, amount)?;

        emit!(WithdrawEvent {
            user: user_owner,
            amount,
        });

        Ok(())
    }

    pub fn grant_bonus_slot(ctx: Context<GrantBonusSlot>) -> Result<()> {
        let acct = &mut ctx.accounts.user;
        acct.referral_cap = acct.referral_cap.saturating_add(1);
        emit!(BonusGrantedEvent {
            user: acct.owner,
            new_cap: acct.referral_cap,
        });
        Ok(())
    }

    pub fn allow_reentry(ctx: Context<AllowReentry>) -> Result<()> {
        let acct = &mut ctx.accounts.user;
        acct.last_deposit = 0;
        emit!(ReentryEvent { user: acct.owner });
        Ok(())
    }

    pub fn redistribute(ctx: Context<Redistribute>, recipients: Vec<Pubkey>) -> Result<()> {
        let g = &mut ctx.accounts.global;
        require!(!recipients.is_empty(), ErrorCode::NoRecipients);

        let total = g.reserve_pool;
        require!(total > 0, ErrorCode::NoReserve);

        let to_distribute = total.checked_div(2).unwrap();
        let remain = total.checked_sub(to_distribute).unwrap();
        g.reserve_pool = remain;

        let per = to_distribute
            .checked_div(recipients.len() as u64)
            .ok_or(ErrorCode::MathError)?;
        require!(per > 0, ErrorCode::PerShareZero);

        // NOTE: client must provide recipient ATAs in `remaining_accounts`
        let mut ai_iter = ctx.remaining_accounts.iter();
        for _ in 0..recipients.len() {
            let recipient_ata = ai_iter
                .next()
                .ok_or(ErrorCode::MissingRecipientTokenAccount)?;
            do_transfer_from_vault_to_pubkey(&ctx, recipient_ata, per)?;
        }

        emit!(RedistributedEvent {
            amount: to_distribute,
            recipients,
        });

        Ok(())
    }
}

// ---------------- Accounts ----------------

#[account]
pub struct Global {
    pub admin: Pubkey,
    pub reserve: Pubkey,
    pub vault: Pubkey,
    pub token_mint: Pubkey,
    pub deposit_amount: u64,
    pub default_referral_cap: u8,
    pub min_withdrawal: u64,
    pub reserve_pool: u64,
    pub reentry_cooldown: u64,
    pub bump: u8,
}

#[account]
pub struct UserAccount {
    pub owner: Pubkey,
    pub registered: bool,
    pub has_deposited: bool,
    pub last_deposit: i64,
    pub referrer: Pubkey,
    pub referrals: Vec<Pubkey>,
    pub referral_cap: u8,
    pub balance: u64,
    pub total_earned: u64,
    pub total_referrals: u64,
    pub legacy_flag: bool,
}

// ---------------- Events ----------------
#[event]
pub struct DepositEvent {
    pub sender: Pubkey,
    pub amount: u64,
}

#[event]
pub struct WithdrawEvent {
    pub user: Pubkey,
    pub amount: u64,
}

#[event]
pub struct BonusGrantedEvent {
    pub user: Pubkey,
    pub new_cap: u8,
}

#[event]
pub struct ReentryEvent {
    pub user: Pubkey,
}

#[event]
pub struct RedistributedEvent {
    pub amount: u64,
    pub recipients: Vec<Pubkey>,
}

// ---------------- Contexts ----------------

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 200, seeds = [b"global"], bump)]
    pub global: Account<'info, Global>,

    /// CHECK: vault ATA created by client
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,

    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: arbitrary reserve wallet
    pub reserve: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, seeds = [b"global"], bump = global.bump)]
    pub global: Account<'info, Global>,

    #[account(
        init_if_needed,
        payer = user_authority,
        space = 8 + 32 + 1 + 1 + 8 + 32 + 4 + 32 * 10 + 1 + 8 + 8 + 8 + 1,
        seeds = [b"user", user_authority.key().as_ref()],
        bump
    )]
    pub user: Account<'info, UserAccount>,

    /// CHECK: Optional referrer account
    pub referrer_account: Option<AccountInfo<'info>>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, seeds = [b"global"], bump = global.bump)]
    pub global: Account<'info, Global>,

    #[account(mut, seeds = [b"user", user_authority.key().as_ref()], bump)]
    pub user: Account<'info, UserAccount>,

    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub dest_token_account: Account<'info, TokenAccount>,

    pub user_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct GrantBonusSlot<'info> {
    #[account(mut, has_one = owner)]
    pub user: Account<'info, UserAccount>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct AllowReentry<'info> {
    #[account(mut, has_one = owner)]
    pub user: Account<'info, UserAccount>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct Redistribute<'info> {
    #[account(mut, seeds = [b"global"], bump = global.bump)]
    pub global: Account<'info, Global>,
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// ---------------- Helpers & Error Codes ----------------

// NOTE: helpers below should use `CpiContext::new_with_signer` when PDA is authority

fn do_transfer_from_vault_to_user(ctx: &Context<Withdraw>, amount: u64) -> Result<()> {
    // Implementation for vault to user transfer
    // This is a placeholder - implement actual CPI transfer logic
    let _ = (ctx, amount);
    Ok(())
}

fn do_transfer_from_vault_to_pubkey(
    ctx: &Context<Redistribute>,
    recipient_ata: &AccountInfo,
    amount: u64,
) -> Result<()> {
    // Implementation for vault to recipient transfer
    // This is a placeholder - implement actual CPI transfer logic
    let _ = (ctx, recipient_ata, amount);
    Ok(())
}

#[error_code]
#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub enum ErrorCode {
    #[msg("Invalid deposit amount")]
    InvalidDepositAmount,
    #[msg("Cooldown active")]
    CooldownActive,
    #[msg("Math error")]
    MathError,
    #[msg("Invalid referrer")]
    InvalidReferrer,
    #[msg("Below minimum withdrawal")]
    BelowMinWithdrawal,
    #[msg("No recipients")]
    NoRecipients,
    #[msg("No reserve to distribute")]
    NoReserve,
    #[msg("Per share would be zero")]
    PerShareZero,
    #[msg("Missing recipient token account in remaining accounts")]
    MissingRecipientTokenAccount,
}
