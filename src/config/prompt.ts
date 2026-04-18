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
