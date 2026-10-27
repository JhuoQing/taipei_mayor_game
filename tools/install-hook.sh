#!/bin/sh
# 安裝 git pre-commit：每次 commit 前自動執行金鑰檢查，掃到疑似金鑰就擋下來。
# 用法（在專案根目錄）：sh tools/install-hook.sh
set -e
[ -d .git ] || { echo "請在 git 專案的根目錄執行（找不到 .git）"; exit 1; }
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/sh
node tools/check-secrets.js
EOF
chmod +x .git/hooks/pre-commit
echo "已安裝 pre-commit 檢查。"
