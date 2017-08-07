interface MyWindow extends Window {
	webkitURL
}

interface deviceBlob extends Blob {
	localURL?: string,
	originalUrl?: string
}

declare var window: MyWindow
declare var webkitURL

import * as Bluebird from "bluebird"
const debug = require("debug")

import h from "../helper/helper"
import Progress from "../asset/Progress"

import blobCache from "../asset/blobCache"

import socketService from "./socket.service"
import BlobDownloader from "./blobDownloader.service"

import { File } from '@ionic-native/file';

const file = new File()

const initService = require("services/initService");
const Queue = require("asset/Queue");
const keyStore = require("crypto/keyStore");

const knownBlobs = {};
const downloadBlobQueue = new Queue(5);
downloadBlobQueue.start();

const debugName = "whispeer:blobService";
const blobServiceDebug = debug(debugName);

const time = (name) => {
	if (debug.enabled(debugName)) {
		// eslint-disable-next-line no-console
		console.time(name);
	}
}

const timeEnd = (name) => {
	if (debug.enabled(debugName)) {
		// eslint-disable-next-line no-console
		console.timeEnd(name);
	}
}

export const unpath = (path: string): { name: string, directory: string } => {
	const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1

	return {
		directory: path.substr(0, index),
		name: path.substr(index)
	}
}

class MyBlob {
	private blobData: deviceBlob
	private blobID: string
	private uploaded: boolean
	private meta
	private key
	private decrypted: boolean
	private preReservedID: string

	public uploadProgress
	public encryptProgress
	public decryptProgress

	constructor(blobData, blobID?, options?: { meta?, decrypted? }) {
		this.blobData = blobData;
		options = options || {};

		if (blobID) {
			this.blobID = blobID;
			this.uploaded = true;
		} else {
			this.uploaded = false;
		}

		this.meta = options.meta || {};
		this.key = this.meta.key;
		this.decrypted = options.decrypted || !this.key;

		this.uploadProgress = new Progress({ total: this.getSize() });
		this.encryptProgress = new Progress({ total: this.getSize() });
		this.decryptProgress = new Progress({ total: this.getSize() });
	}

	isDecrypted() {
		return this.decrypted
	}

	isUploaded() {
		return this.uploaded;
	}

	getSize() {
		return this.blobData.size;
	}

	getMeta() {
		return this.meta;
	}

	private getArrayBuffer() {
		if (this.blobData.originalUrl) {
			const { directory, name } = unpath(this.blobData.originalUrl)

			return Bluebird.resolve(file.readAsArrayBuffer(directory, name))
		}

		return new Bluebird((resolve) => {
			const reader = new FileReader();

			if (reader.addEventListener) {
				reader.addEventListener("loadend", resolve);
			} else {
				reader.onloadend = resolve;
			}

			reader.readAsArrayBuffer(this.blobData);
		}).then((event: any) => {
			const target = event.currentTarget || event.target;

			return target.result;
		});
	}

	encryptAndUpload (key) {
		return Bluebird.try(async () => {
			const blobKey = await this.encrypt();
			await keyStore.sym.symEncryptKey(blobKey, key);
			await this.upload();

			return blobKey;
		})
	}

	encrypt () {
		return Bluebird.resolve().then(() => {
			if (this.uploaded || !this.decrypted) {
				throw new Error("trying to encrypt an already encrypted or public blob. add a key decryptor if you want to give users access");
			}

			return Bluebird.all([
				keyStore.sym.generateKey(null, "blob key"),
				this.getArrayBuffer()
			]);
		}).spread((key, buf) => {
			this.key = key;

			time("blobencrypt" + (this.blobID || this.preReservedID));
			return keyStore.sym.encryptArrayBuffer(buf, this.key, (progress) => {
				this.encryptProgress.progress(this.getSize() * progress);
			});
		}).then((encryptedData) => {
			this.encryptProgress.progress(this.getSize());
			timeEnd("blobencrypt" + (this.blobID || this.preReservedID));
			blobServiceDebug(encryptedData.byteLength);
			this.decrypted = false;

			this.blobData = new Blob([encryptedData], {type: this.blobData.type});

			return this.key;
		})
	}

	decrypt () {
		if (this.decrypted) {
			return Bluebird.resolve()
		}

		return Bluebird.try(() => {
			return this.getArrayBuffer();
		}).then((encryptedData) => {
			time("blobdecrypt" + this.blobID);
			return keyStore.sym.decryptArrayBuffer(encryptedData, this.key, (progress) => {
				this.decryptProgress.progress(this.getSize() * progress)
			})
		}).then((decryptedData) => {
			this.decryptProgress.progress(this.getSize())
			timeEnd("blobdecrypt" + this.blobID);

			this.decrypted = true;

			this.blobData = new Blob([decryptedData], {type: this.blobData.type});

			return blobCache.store(this).catch((e) => {
				console.log("Could not store blob", e)
				return this.toURL()
			})
		})
	}

	toURL() {
		return Bluebird.try(() => {
			if (this.blobData.localURL) {
				return this.blobData.localURL;
			}

			if (typeof window.URL !== "undefined") {
				return window.URL.createObjectURL(this.blobData);
			}

			if (typeof webkitURL !== "undefined") {
				return window.webkitURL.createObjectURL(this.blobData);
			}

			return Bluebird.fromCallback((cb) => {
				h.blobToDataURI(this.blobData, cb)
			})
		}).catch(() => {
			return "";
		})
	}


	upload () {
		return Bluebird.try(() => {
			if (this.uploaded) {
				return this.blobID;
			}

			return this.reserveID();
		}).then((blobid) => {
			return socketService.uploadBlob(this.blobData, blobid, this.uploadProgress);
		}).then(() => {
			this.uploaded = true;

			return this.blobID;
		})
	}

	getBlobID() {
		return this.blobID
	}

	getBlobData() {
		return this.blobData
	}

	private reserveID () {
		return Bluebird.try(() => {
			const meta = this.meta;
			meta.key = this.key;
			meta.one = 1;

			if (this.preReservedID) {
				return socketService.emit("blob.fullyReserveID", {
					blobid: this.preReservedID,
					meta: meta
				});
			}

			return socketService.emit("blob.reserveBlobID", {
				meta: meta
			});
		}).then((data) => {
			if (data.blobid) {
				this.blobID = data.blobid;

				knownBlobs[this.blobID] = Bluebird.resolve(this);

				return this.blobID;
			}
		})
	}

	preReserveID () {
		return Bluebird.try(() => {
			return socketService.emit("blob.preReserveID", {});
		}).then((data) => {
			if (data.blobid) {
				this.preReservedID = data.blobid;
				knownBlobs[this.preReservedID] = Bluebird.resolve(this);
				return data.blobid;
			}

			throw new Error("got no blobid");
		})
	}

	getHash() {
		return this.getArrayBuffer().then((buf) => {
			return keyStore.hash.hashArrayBuffer(buf)
		})
	}
}

const loadBlobFromServer = (blobID, downloadProgress) => {
	return downloadBlobQueue.enqueue(1, () => Bluebird.try(async () => {
		await initService.awaitLoading()
		const data = await new BlobDownloader(socketService, blobID, downloadProgress).download()

		const blob = new MyBlob(data.blob, blobID, { meta: data.meta });

		if (blob.isDecrypted()) {
			await blobCache.store(blob)
		}

		return blob;
	}))
}

const loadBlobFromDB = (blobID) => {
	return blobCache.get(blobID).then(({ blob, blobID, meta }) => {
		return new MyBlob(blob, blobID, { meta, decrypted: true });
	});
}

const loadBlob = (blobID, downloadProgress) => {
	return loadBlobFromDB(blobID).catch(() => {
		return loadBlobFromServer(blobID, downloadProgress);
	})
}

const getBlob = (blobID, downloadProgress?: Progress) => {
	if (!knownBlobs[blobID]) {
		knownBlobs[blobID] = loadBlob(blobID, downloadProgress)
	}

	return knownBlobs[blobID]
}

const blobService = {
	createBlob: (blob) => {
		return new MyBlob(blob);
	},
	isBlobLoaded: (blobID) => {
		return blobCache.isLoaded(blobID)
	},
	getBlobUrl: (blobID, progress?: Progress, estimatedSize?: number,) => {
		return blobCache.getBlobUrl(blobID).catch(() => {
			if (!progress) {
				return getBlob(blobID).then((blob) => blob.decrypt())
			}

			const decryptProgressStub = new Progress({ total: estimatedSize || 0 })
			const downloadProgress = new Progress({ total: estimatedSize || 0 })

			const loadProgress = new Progress({ depends: [ downloadProgress, decryptProgressStub ] })

			progress.addDepend(loadProgress)

			return getBlob(blobID, downloadProgress).then((blob: MyBlob) => {
				downloadProgress.progress(downloadProgress.getTotal())

				loadProgress.removeDepend(decryptProgressStub)
				loadProgress.addDepend(blob.decryptProgress)

				return blob.decrypt()
			})
		})
	},
}

export type BlobType = MyBlob

export default blobService
