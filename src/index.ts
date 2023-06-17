
export interface Env { }

import { WASI, ProcessExit } from '@cloudflare/workers-wasi';
import mywasm from './ffmpeg-lite.wasm';


export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname != '/') {
			return new Response('Not found', { status: 404 })
		}

		// parse args
		let args = ['ffmpeg'];
		let extra = url.searchParams.get('args')?.split(' ');
		if (extra) {
			args = args.concat(extra);
		}

		// setup io
		const stdout = new TransformStream()
		const stderrStream = new WritableStream({
			write(chunk) {
				return new Promise((resolve, reject) => {
					console.log(new TextDecoder().decode(chunk));
					resolve();
				});
			},
		});

		const wasi = new WASI({
			args: args,
			stdout: stdout.writable,
			stderr: stderrStream,
			stdin: request.body ?? undefined,
		});

		const instance = new WebAssembly.Instance(mywasm, {
			wasi_snapshot_preview1: wasi.wasiImport
		});

		const resp = new Response(stdout.readable);

		// start ffmpeg wasm
		try {
			await wasi.start(instance);
		} catch (ex) {
			if (ex instanceof ProcessExit) {
				console.log('exit', ex.code);
			} else {
				console.log('exception', ex);
			}
		}

		return resp;
	},
};
