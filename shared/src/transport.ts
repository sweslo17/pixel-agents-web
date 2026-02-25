/** Transport abstraction replacing vscode.Webview */
export interface MessageSink {
	postMessage(msg: unknown): void;
}
