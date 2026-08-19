#!/usr/bin/env python3
"""合規詞庫掃描器 — 發布前的強制關卡。

用法:
    python3 compliance/check.py draft.txt
    python3 compliance/check.py drafts/*.md --market hk
    python3 compliance/check.py draft.txt --json
    echo "食完血糖降咗" | python3 compliance/check.py -

退出碼:
    0  無 block 級發現（warn 仍可能存在）
    1  有 block 級發現，不得發布
    2  用法或檔案錯誤

這是機器輔助，不是法律意見。掃描通過只代表沒有命中已知規則，
仍須指定人工簽核。規則庫: compliance/rules.json
"""

import argparse
import json
import re
import sys
from pathlib import Path

RULES_PATH = Path(__file__).with_name("rules.json")

RESET = "\033[0m"
BOLD = "\033[1m"
RED = "\033[31m"
YELLOW = "\033[33m"
GREEN = "\033[32m"
DIM = "\033[2m"


def load_rules(market):
    try:
        data = json.loads(RULES_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        sys.exit(f"讀取規則庫失敗 {RULES_PATH}: {exc}")

    rules = []
    for raw in data["rules"]:
        if market != "all" and market not in raw["markets"]:
            continue
        rule = dict(raw)
        rule["regex"] = re.compile(raw["pattern"], re.IGNORECASE)
        if raw.get("satisfied_by"):
            rule["satisfied_by_regex"] = re.compile(raw["satisfied_by"], re.IGNORECASE)
        rules.append(rule)
    return rules, data.get("version", "?")


def scan(text, rules, source):
    """回傳 findings，每項含來源、行號、欄號、命中文字與規則。

    規則若設 satisfied_by，而整份文件已包含該內容（例如免責聲明），則不報告。
    """
    active = [
        rule
        for rule in rules
        if not (rule.get("satisfied_by_regex") and rule["satisfied_by_regex"].search(text))
    ]

    findings = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        for rule in active:
            for match in rule["regex"].finditer(line):
                findings.append(
                    {
                        "source": source,
                        "line": lineno,
                        "column": match.start() + 1,
                        "matched": match.group(0),
                        "rule_id": rule["id"],
                        "severity": rule["severity"],
                        "reason": rule["reason"],
                        "suggestion": rule["suggestion"],
                        "line_text": line.strip(),
                    }
                )
    findings.sort(key=lambda f: (f["severity"] != "block", f["source"], f["line"], f["column"]))
    return findings


def read_source(name):
    if name == "-":
        return sys.stdin.read(), "<stdin>"
    path = Path(name)
    if not path.is_file():
        sys.exit(f"找不到檔案: {name}")
    return path.read_text(encoding="utf-8", errors="replace"), str(path)


def render(findings, use_color):
    def paint(code, s):
        return f"{code}{s}{RESET}" if use_color else s

    if not findings:
        print(paint(GREEN + BOLD, "✓ 未命中任何規則"))
        print(paint(DIM, "  提醒：掃描通過不等於合規。仍須指定人工簽核。"))
        return

    current_source = None
    for f in findings:
        if f["source"] != current_source:
            current_source = f["source"]
            print(f"\n{paint(BOLD, current_source)}")

        if f["severity"] == "block":
            tag = paint(RED + BOLD, "BLOCK")
        else:
            tag = paint(YELLOW + BOLD, " WARN")

        loc = f"{f['line']}:{f['column']}"
        print(f"  {tag} {paint(DIM, loc)}  「{paint(BOLD, f['matched'])}」  [{f['rule_id']}]")
        print(f"        {paint(DIM, f['line_text'][:110])}")
        print(f"        依據：{f['reason']}")
        print(f"        建議：{f['suggestion']}")


def main():
    parser = argparse.ArgumentParser(
        description="合規詞庫掃描器：發布前檢查文案是否命中違規用語規則。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("files", nargs="+", help="要掃描的檔案；用 - 讀取 stdin")
    parser.add_argument(
        "--market",
        default="all",
        choices=["all", "hk", "cn", "us"],
        help="目標市場的規則集（預設 all，最嚴格）",
    )
    parser.add_argument("--json", action="store_true", help="輸出 JSON，供自動化流程使用")
    parser.add_argument(
        "--warn-as-block",
        action="store_true",
        help="把 warn 級也視為不通過（用於最終發布關卡）",
    )
    parser.add_argument("--no-color", action="store_true", help="停用彩色輸出")
    args = parser.parse_args()

    rules, version = load_rules(args.market)

    all_findings = []
    for name in args.files:
        text, source = read_source(name)
        all_findings.extend(scan(text, rules, source))

    blocks = sum(1 for f in all_findings if f["severity"] == "block")
    warns = len(all_findings) - blocks
    failed = blocks > 0 or (args.warn_as_block and warns > 0)

    if args.json:
        json.dump(
            {
                "rules_version": version,
                "market": args.market,
                "files": args.files,
                "block": blocks,
                "warn": warns,
                "passed": not failed,
                "findings": all_findings,
            },
            sys.stdout,
            ensure_ascii=False,
            indent=2,
        )
        print()
    else:
        use_color = sys.stdout.isatty() and not args.no_color
        render(all_findings, use_color)
        if all_findings:
            print(f"\n合計：BLOCK {blocks} · WARN {warns} · 規則庫 v{version} · 市場 {args.market}")
            print("不得發布" if failed else "可交人工審核（僅 WARN）")

    return 1 if failed else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        # 下游被 head / less 截斷，屬正常情況
        sys.stderr.close()
        sys.exit(1)
