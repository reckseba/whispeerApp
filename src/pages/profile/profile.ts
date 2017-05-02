import { Component } from "@angular/core";
import { NavController, NavParams, ActionSheetController, AlertController, AlertOptions, Platform, IonicPage } from 'ionic-angular';
import sessionService from '../../lib/services/session.service';
import * as Bluebird from 'bluebird';

const userService = require("user/userService")
const friendsService = require("services/friendsService")
const blobService = require("services/blobService")
const ImageUpload = require("services/imageUploadService")

import { ImagePicker } from "@ionic-native/image-picker";
import { File } from "@ionic-native/file";
import { Camera } from "@ionic-native/camera";
import { BarcodeScanner } from "@ionic-native/barcode-scanner";
import { PhotoViewer } from '@ionic-native/photo-viewer';

const ImagePickerOptions = {
	width: 2560,
	height: 1440,
	maximumImagesCount: 1
};

const CameraOptions = {
	destinationType: 1, // value 2 breaks ios.
	allowEdit: true,
	encodingType: 0,
	// targetWidth: ImagePickerOptions.width,
	// targetHeight: ImagePickerOptions.height,
	// correctOrientation: true
};

const imageUploadOptions = {
	sizes: [
		{
			name: "lowest",
			restrictions: {
				maxWidth: 480,
				maxHeight: 480,
				square: true
			}
		}
	],
	gif: false,
	original: false,
	encrypt: false
}

@IonicPage({
	name: "Profile",
	segment: "profile/:userId"
})
@Component({
	selector: 'page-profile',
	templateUrl: 'profile.html'
})
export class ProfilePage {
	user: any = {
		basic: {},
		names: {},
		advanced: {}
	};

	userObject: any;
	// this should be my own id by default @Nilos!
	userId: number;

	isRequest: boolean;
	isRequestable: boolean;
	isOwn: boolean;

	fingerprint: string[];

	view: string = "profile";

	profileLoading: boolean = true;

	constructor(
		public navCtrl: NavController,
		public navParams: NavParams,
		private actionSheetCtrl: ActionSheetController,
		private alertCtrl: AlertController,
		private platform: Platform,
		private file: File,
		private camera: Camera,
		private imagePicker: ImagePicker,
		private barcodeScanner: BarcodeScanner,
		private photoViewer: PhotoViewer,
	) {}

	ngOnInit() {
		this.userId = parseFloat(this.navParams.get("userId"));
		this.isOwn = true;

		const awaitFriendsService = friendsService.awaitLoading().then(() => {
			var requests = friendsService.getRequests();
			this.isRequest = requests.indexOf(this.userId) > -1

			this.isOwn = this.userId === parseFloat(sessionService.userid);

			this.isRequestable = friendsService.noRequests(this.userId) && !this.isOwn;
		});

		Bluebird.all([
			userService.get(this.userId),
			awaitFriendsService
		]).then(([user]) => {
			if (user.isNotExistingUser()) {
				this.user = user.data
				this.profileLoading = false
				return;
			}

			var fp = user.getFingerPrint();
			this.fingerprint = [fp.substr(0,13), fp.substr(13,13), fp.substr(26,13), fp.substr(39,13)];

			return user.loadFullData().thenReturn(user);
		}).then((user) => {
			this.userObject = user;
			this.user = this.userObject.data;

			this.profileLoading = false;
		});
	}

	attributeSet(val) {
		if (Array.isArray(val)) {
			return val.length > 0;
		}

		if (typeof val === "object") {
			return Object.keys(val).length > 0;
		}

		return val;
	}

	goBack() {
		this.navCtrl.pop();
	}

	private addOrAccept() {
		if (this.isRequest) {
			return friendsService.acceptFriendShip(this.userId).then(() => {
				this.alertCtrl.create({
					title: "Accepted!",
					message: `${this.user.name} is now in your contacts.`,
					buttons: ["Ok"]
				}).present();
			});
		}

		return friendsService.friendship(this.userId).then(() => {
			this.alertCtrl.create({
				title: "Request sent!",
				message: `You've sent a contact request to ${this.user.name}.`,
				buttons: ["Ok"]
			}).present();
		});
	}

	acceptRequest() {
		let addOrAcceptConfirm;

		if(this.isRequest) {
			addOrAcceptConfirm = this.alertCtrl.create({
				title: 'Accept Request?',
				message: 'Do you want to add this person as a contact?',
				buttons: [
					{ text: 'Decline', role: 'danger' },
					{ text: 'Accept',
						handler: () => {
							this.doAdd();
						}
					}
				]
			});
			addOrAcceptConfirm.setCssClass("profile__request-accept");
		} else {
			addOrAcceptConfirm = this.alertCtrl.create({
				title: 'Send Request?',
				message: 'Do you want to send a contact request to this person?',
				buttons: [
					{ text: 'Cancel', role: 'cancel' },
					{ text: 'Send',
						handler: () => {
							this.doAdd();
						}
					}
				]
			});
			addOrAcceptConfirm.setCssClass("profile__send-confirm");
		}

		addOrAcceptConfirm.present();
	}

	private doAdd() {
		this.profileLoading = true;

		this.addOrAccept().then(() => {
			this.profileLoading = false;
			this.isRequest = false;
		});
	}

	declineRequest() {
		if (!this.isRequest) {
			this.isRequestable = false;
			return;
		}

		this.profileLoading = true;

		friendsService.ignoreFriendShip(this.userId).then(() => {
			this.profileLoading = false;
			this.isRequest = false;
		});
	}

	writeMessage() {
		this.navCtrl.push("New Message", {
			receiverIds: this.user.id.toString()
		});
	}

	verifyPerson = () => {
		return this.barcodeScanner.scan().then((res) => {
			return this.userObject.verifyFingerPrint(res.text);
		}).catch((err) => {
			console.error(err);
		});
	}

	contactOptions() {
		this.actionSheetCtrl.create({
			buttons: [{
				icon: !this.platform.is("ios") ? "lock": null,
				text: "Verify this Contact",
				handler: () => {
					this.verifyPerson();
				}
			}, {
				text: "Remove from Contacts",
				role: "destructive",
				icon: !this.platform.is("ios") ? "trash" : null,
				handler: () => {
					this.alertCtrl.create(<AlertOptions>{
						title: "Remove Contact",
						message: "Are you sure that you want to remove this Contact?",
						buttons: [{
							text: "Cancel",
							role: "cancel"
						}, {
							text: "Remove",
							role: "destructive",
							cssClass: "alert-button-danger",
							handler: () => {
								this.user.user.removeAsFriend();
							}
						}]
					}).present();
				}
			}, {
				text: "Cancel",
				role: "cancel",
				icon: !this.platform.is("ios") ? "close" : null,
			}]
		}).present();
	}

	// 1:1 copy from topicDisplay. maybe this should go into the helper?
	getFile = (url: string, type: string) : Bluebird<any> => {
		return new Bluebird((resolve, reject) => {
			this.file.resolveLocalFilesystemUrl(url).then((entry: any) => {
				return entry.file(resolve, reject);
			});
		}).then((file: any) => {
			file.originalUrl = url;
			if(this.platform.is("ios")) {
				file.localURL = url.replace("file://", "http://ionic.local");
			}
			file.type = type;

			return file;
		});
	}

	removeProfileImage() {
		return Promise.all([
			this.userObject.removeProfileAttribute("image"),
			this.userObject.removeProfileAttribute("imageBlob")
		]).then(() => {
			return this.userObject.uploadChangedProfile()
		})
	}

	uploadProfileImage(url) {
		return this.getFile(url, "image/png").then((file) => {
			const upload = new ImageUpload(file, imageUploadOptions)

			return upload.prepare().then(({ lowest }) => {
				return upload.upload().thenReturn(lowest)
			})
		}).then((imageMeta) => {
			var setImageBlobAttributePromise = this.userObject.setProfileAttribute("imageBlob", {
				blobid: imageMeta.blobID,
				imageHash: imageMeta.blobHash
			});

			var removeImageAttributePromise = this.userObject.removeProfileAttribute("image");

			return Promise.all([
				setImageBlobAttributePromise,
				removeImageAttributePromise
			]);
		}).then(() => {
			return this.userObject.uploadChangedProfile()
		})
	}

	avatarClicked() {
		this.actionSheetCtrl.create({
			buttons: [{
				icon: !this.platform.is("ios") ? "eye": null,
				text: "View",
				handler: () => {
					this.userObject.getProfileAttribute("imageBlob").then(({ blobid }) => {
						return blobService.getBlob(blobid)
					}).then((blob) => {
						return blob.decrypt().thenReturn(blob)
					}).then((blob) => {
						return blob.getStringRepresentation();
					}).then((base64) => {
						this.photoViewer.show(base64);
					});
					console.log("view image")
				}
			}, {
				icon: !this.platform.is("ios") ? "camera": null,
				text: "Take a Photo",
				handler: () => {
					this.camera.getPicture(CameraOptions).then((url) => {
						return this.uploadProfileImage(url)
					})
				}
			}, {
				icon: !this.platform.is("ios") ? "image": null,
				text: "Select from Gallery",
				handler: () => {
					Bluebird.resolve(this.imagePicker.getPictures(ImagePickerOptions)).map((result: any) => {
						return this.uploadProfileImage(result)
					})
				}
			}, {
				text: "Remove",
				role: "destructive",
				icon: !this.platform.is("ios") ? "trash" : null,
				handler: () => {
					this.alertCtrl.create({
						title: "Remove Picture",
						message: "Are you sure that you want to remove your Picture?",
						buttons: [{
							text: "Cancel",
							role: "cancel"
						}, {
							text: "Remove",
							role: "destructive",
							cssClass: "alert-button-danger",
							handler: () => {
								this.removeProfileImage()
							}
						}]
					}).present();
				}
			}, {
				text: "Cancel",
				role: "cancel",
				icon: !this.platform.is("ios") ? "close" : null
			}]
		}).present();
	}

	close = () => {
		this.navCtrl.setRoot("Home");
	}
}
