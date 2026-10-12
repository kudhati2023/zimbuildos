from google.antigravity.hooks.policy import allow, ask_user, deny
from google.antigravity.triggers import every

# Security & Governance Policy Hooks
security_policies = [
    # Terminal Execution Security Rule: block unreviewed terminal executions
    deny("unreviewed_terminal_execution"),
    ask_user(
        "run_command",
        message="Unreviewed terminal command execution detected. User approval required to execute shell commands."
    ),
    # Credential & Secret Commit Prevention: block committing hardcoded keys or secrets
    deny("commit_hardcoded_secrets"),
    ask_user(
        "git_commit",
        message="Verify that no hardcoded credentials, API keys, or private secrets exist in staged files before committing."
    ),
]

# Legal Title Release Policy Hook
legal_policies = [
    deny("release_title_deed"),
    ask_user(
        "release_title_deed",
        message="Verify 100% payment, cession clearance, and surveyor approval before releasing title deed."
    ),
    allow("view_cession_records"),
    allow("generate_receipt")
]

# Combined Workspace Policies
policies = security_policies + legal_policies

# Background Trigger for Installment Tracking
async def check_payment_queue(ctx):
    await ctx.send(
        "Poll EcoCash gateway for newly cleared installments and update dual-currency ledgers."
    )

triggers = [
    every(300, check_payment_queue)
]
