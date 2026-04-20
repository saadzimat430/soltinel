/**
 * Shared readline singleton.
 *
 * Node.js readline closes (and pauses) stdin when the interface is destroyed.
 * If each prompt creates and closes its own interface, every subsequent prompt
 * gets a paused stream and silently resolves with "" — causing skipped prompts
 * and unexpected behaviour. One interface, created once, fixes this.
 */
import * as rl from "node:readline/promises";
import { stdin, stdout } from "node:process";

let _interface: rl.Interface | null = null;

export function getReadline(): rl.Interface {
  if (!_interface) {
    _interface = rl.createInterface({ input: stdin, output: stdout });
    // When the interface emits 'close' (e.g. stdin EOF in a pipe), null it out
    // so the next call recreates it rather than using a dead reference.
    _interface.once("close", () => { _interface = null; });
  }
  return _interface;
}

export function closeReadline(): void {
  _interface?.close();
  _interface = null;
}

export async function ask(question: string): Promise<string> {
  return getReadline().question(question);
}

export async function askPassword(prompt: string): Promise<string> {
  // readline and raw mode cannot share stdin simultaneously — close the singleton first.
  closeReadline();

  // Non-interactive (pipe / CI): fall back to visible input via a fresh readline.
  if (!process.stdin.isTTY) {
    return ask(prompt);
  }

  return new Promise<string>((resolve) => {
    const chars: string[] = [];
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const handler = (char: string) => {
      switch (char) {
        case "\r":
        case "\n":
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", handler);
          process.stdout.write("\n");
          resolve(chars.join(""));
          break;
        case "\u0003": // Ctrl-C
          process.stdout.write("\n");
          process.exit(0);
          break;
        case "\u007f": // Backspace (DEL)
        case "\b":
          if (chars.length) { chars.pop(); process.stdout.write("\b \b"); }
          break;
        default:
          chars.push(char);
          process.stdout.write("*");
      }
    };

    process.stdin.on("data", handler);
  });
}
