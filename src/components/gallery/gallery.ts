import { Component, Input } from "@angular/core"
import { DomSanitizer, SafeUrl } from '@angular/platform-browser' // tslint:disable-line:no-unused-variable

import errorService from "../../lib/services/error.service"
import blobService from "../../lib/services/blobService"

import * as Bluebird from "bluebird"
import { PhotoViewer } from '@ionic-native/photo-viewer'

interface imageInfo {
	blobID: string,
	loaded: boolean,
	loading: boolean,
	url: SafeUrl | string,
	originalUrl: string,
	width?: number,
	height?: number
}

interface imageQualities {
	highest: imageInfo,
	middle: imageInfo,
	lowest: imageInfo,
	upload: {}
}

@Component({
	selector: "gallery",
	templateUrl: "gallery.html"
})
export class GalleryComponent {
	_images: imageQualities[]

	@Input() set images(value: imageQualities[]) {
		this._images = value
		this.loadPreviews()
	}

	get images(): imageQualities[] {
		return this._images
	}

	previewChunk: number = 2
	preview: number = this.previewChunk

	constructor(private sanitizer:DomSanitizer, private photoViewer: PhotoViewer){}

	loadImage(data: imageInfo) {
		const blobid = data.blobID

		if (data.loaded) {
			return Bluebird.resolve(data.originalUrl)
		}

		data.loading = true

		return Bluebird.try(() => blobService.getBlobUrl(blobid, "image/jpeg", 0))
			.then((url) => {
				data.loading = false
				data.loaded = true
				data.url = this.sanitizer.bypassSecurityTrustUrl(
					window.device && window.device.platform === 'iOS' ? url.replace('file://', '') : url
				)
				data.originalUrl = url

				return url
			})
	}

	loadImagePreviews(images: imageQualities[]) {
		images.forEach((image) => {
			if (image.lowest && typeof image.lowest.url === "string" && image.highest && typeof image.highest.url === "string") {
				image.highest.url = this.sanitizer.bypassSecurityTrustUrl(image.highest.url)
				image.lowest.url = this.sanitizer.bypassSecurityTrustUrl(image.lowest.url)
				return
			}

			if (!image.lowest.url && image.lowest.width && image.lowest.height) {
				const canvas = document.createElement("canvas")
				canvas.width = image.lowest.width
				canvas.height = image.lowest.height
				image.lowest.url = this.sanitizer.bypassSecurityTrustUrl(canvas.toDataURL())
			}

			this.loadImage(image.lowest)
				.catch(errorService.criticalError)
		})
	}

	isLoading = (image) => {
		return image.highest && image.highest.loading
			|| image.middle && image.middle.loading
			|| image.lowest && image.lowest.loading
	}

	displayImage = (image) => {
		if (image.upload) {
			this.photoViewer.show(image.upload._file.originalUrl)
			return
		}

		this.loadImage(image.highest || image.middle || image.lowest)
			.then((url) => this.photoViewer.show(url))
			.catch(errorService.criticalError)
	}

	loadMoreImages() {
		this.loadImagePreviews(this.images.slice(this.preview, this.preview + this.previewChunk))
		this.preview += this.previewChunk
	}

	runGif() {
		return false
	}

	loadPreviews() {
		this.loadImagePreviews(this.images.slice(0, this.preview))
	}

	ngOnInit() {
		this.loadPreviews()
	}
}
