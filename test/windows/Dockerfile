# Checks the Windows installer scripts with PowerShell on Linux (no registry: -SkipRegistry).
# Build context: the repository root. Run with: npm run test:windows-scripts
FROM node:22-bookworm
ARG PWSH_VERSION=7.7.0
RUN arch=$(dpkg --print-architecture | sed 's/amd64/x64/') \
  && curl -fsSL "https://github.com/PowerShell/PowerShell/releases/download/v${PWSH_VERSION}/powershell-${PWSH_VERSION}-linux-${arch}.tar.gz" -o /tmp/pwsh.tgz \
  && mkdir -p /opt/pwsh && tar -xzf /tmp/pwsh.tgz -C /opt/pwsh && rm /tmp/pwsh.tgz \
  && chmod +x /opt/pwsh/pwsh && ln -s /opt/pwsh/pwsh /usr/local/bin/pwsh
RUN useradd --create-home tester
COPY --chown=tester:tester native-host /app/native-host
COPY --chown=tester:tester test/windows /app/test/windows
USER tester
WORKDIR /app
CMD ["pwsh", "-NoProfile", "-File", "test/windows/check.ps1"]
