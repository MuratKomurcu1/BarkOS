# Security Policy

## Supported versions

BarkOS is currently an early preview. Security fixes are applied to the latest code and newest preview release only.

## Reporting a vulnerability

Please do not open a public issue for vulnerabilities, leaked credentials, permission bypasses, or unsafe command execution.

Use GitHub's **Report a vulnerability** flow in the Security tab of this repository. Include:

- the affected version or commit;
- reproduction steps and required permissions;
- the expected and observed behavior;
- the impact and any suggested mitigation.

Do not access data you do not own, disrupt third-party systems, or publish a proof of concept before a fix is available.

## Security model

BarkOS coordinates local AI coding agents that may read files, execute commands, use the network, and modify repositories. The effective authority of every worker is bounded by the permissions granted by the user and the underlying provider. Provider routing must never bypass those gates.

Keep important repositories under version control and inspect high-risk actions before approval.
