"use client";
import React from "react";

interface ShortcutHelpProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  { keys: "Ctrl + Enter", desc: "메시지 전송" },
  { keys: "Ctrl + N", desc: "새 대화 시작" },
  { keys: "Ctrl + Shift + S", desc: "사이드바 열기/닫기" },
  { keys: "Esc", desc: "응답 생성 중단" },
  { keys: "Ctrl + /", desc: "단축키 도움말" },
];

export default function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4">⌨️ 키보드 단축키</h3>
        <table className="w-full">
          <tbody>
            {shortcuts.map((s) => (
              <tr
                key={s.keys}
                className="border-b border-gray-200 dark:border-gray-700"
              >
                <td className="py-2 font-mono text-sm text-blue-600 dark:text-blue-400">
                  {s.keys}
                </td>
                <td className="py-2 text-sm">{s.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-xs text-gray-500">
          Mac에서는 Ctrl 대신 ⌘(Cmd)를 사용하세요
        </p>
      </div>
    </div>
  );
}
