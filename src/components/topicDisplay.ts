import { Component, ViewChild, Input, Output, EventEmitter } from "@angular/core";

import { NavController, ActionSheetController, Content, Footer } from "ionic-angular";

import { ProfilePage } from "../pages/profile/profile";

import * as Bluebird from "bluebird";

import { ImagePicker, File, Camera } from 'ionic-native';

const ImageUpload = require("../assets/services/imageUploadService");

const ImagePickerOptions = {
	width: 2560,
	height: 1440,
	maximumImagesCount: 6
};

const CameraOptions = {
	destinationType: 2,
	allowEdit: true,
	encodingType: 0,
	targetWidth: ImagePickerOptions.width,
	targetHeight: ImagePickerOptions.height,
	correctOrientation: true
};

@Component({
	selector: "topicWithBursts",
	templateUrl: "topic.html"
})
export class TopicComponent {
	@Input() partners;
	@Input() topic;
	@Input() messageBurstsFunction;
	@Input() messagesLoading;

	@Output() sendMessage = new EventEmitter();

	@ViewChild(Content) content: Content;
	@ViewChild(Footer) footer: Footer;

	newMessageText = "";

	constructor(public navCtrl: NavController, private actionSheetCtrl: ActionSheetController,) {}

	contentHeight = 0;
	footerHeight = 0;

	ngOnInit() {
		window.addEventListener('resize', this.keyboardChange);
	}

	ngOnDestroy() {
		window.removeEventListener('resize', this.keyboardChange);
	}

	keyboardChange = () => {
		console.warn("keyboard change");

		this.change();
	}

	sendMessageToTopic = () => {
		this.sendMessage.emit({
			text: this.newMessageText,
			images: []
		});

		this.newMessageText = "";
	}

	getFile = (url: string, type: string) : Bluebird<any> => {
		return new Bluebird((resolve, reject) => {
			File.resolveLocalFilesystemUrl(url).then((entry: any) => {
				return entry.file(resolve, reject);
			});
		}).then((file: any) => {
			file.originalUrl = url;
			file.type = type;

			return file;
		});
	}

	presentActionSheet = () => {
		let actionSheet = this.actionSheetCtrl.create({
			title: "What do you want to send?",
			buttons: [{
				text: "Select from Gallery",
				handler: () => {
					Bluebird.resolve(ImagePicker.getPictures(ImagePickerOptions)).map((result: any) => {
						return this.getFile(result, "image/png");
					}).map((file: any) => {
						return new ImageUpload(file);
					}).then((images) => {
						this.sendMessage.emit({
							images: images,
							text: ""
						});
					});
				}
			}, {
				text: "Take Photo",
				handler: () => {
					Camera.getPicture(CameraOptions).then((url) => {
						return this.getFile(url, "image/png");
					}).then((file: any) => {
						return new ImageUpload(file);
					}).then((image) => {
						this.sendMessage.emit({
							images: [image],
							text: ""
						});
					});
				}
			}, {
				text: "Cancel",
				role: "cancel",
				handler: () => {
					console.log("Cancel clicked.");
				}
			}]
		});

		actionSheet.present();
	}

	awaitRendering = () => {
		return Bluebird.delay(100);
	}

	messageBursts = () => {
		const { changed, bursts } = this.messageBurstsFunction();

		if (changed) {
			const dimension = this.content.getContentDimensions();
			const scrollFromBottom = dimension.scrollHeight - dimension.scrollTop;

			this.awaitRendering().then(() => {
				const newDimension = this.content.getContentDimensions();

				this.content.scrollTo(dimension.scrollLeft, newDimension.scrollHeight - scrollFromBottom, 0);
			})
		}

		return bursts;
	}

	change() {
		setTimeout(() => {
			const fontSize = 16;
			const maxSize = fontSize*7;

			const contentElement = this.content.getScrollElement();
			const footerElement = this.footer.getNativeElement();

			if (!this.footerHeight) {
				this.footerHeight = footerElement.offsetHeight;
			}

			const element   = document.getElementById("sendMessageBox");
			const textarea  = element.getElementsByTagName("textarea")[0];

			textarea.style.minHeight  = "0";
			textarea.style.height     = "0";
			contentElement.style.height = "";

			const contentHeight = contentElement.offsetHeight;


			const scroll_height = Math.min(textarea.scrollHeight, maxSize);

			// apply new style
			element.style.height      = scroll_height + "px";
			textarea.style.minHeight  = scroll_height + "px";
			textarea.style.height     = scroll_height + "px";

			contentElement.style.height = contentHeight - (footerElement.offsetHeight - this.footerHeight) + "px";
		}, 100);
	}

	goToProfile(userId: number) {
		this.navCtrl.push(ProfilePage, {
			userId
		});
	}
}
