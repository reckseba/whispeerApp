require("interceptors/addKeysInterceptor");
require("interceptors/sessionServiceInterceptor");
require("services/trust.service");

import { NgModule, ErrorHandler, NgZone } from '@angular/core';
import { DatePipe } from "@angular/common";

import { IonicApp, IonicErrorHandler } from 'ionic-angular';
import { IonicModule } from 'ionic-angular';

import * as Bluebird from 'bluebird';

import { MyApp } from './app.component';

import { BrowserModule } from '@angular/platform-browser';

import { SplashScreen } from "@ionic-native/splash-screen";
import { StatusBar } from "@ionic-native/status-bar";
import { Globalization } from '@ionic-native/globalization';
import { Push } from '@ionic-native/push';
import { PhotoViewer } from '@ionic-native/photo-viewer';
import { ImagePicker } from '@ionic-native/image-picker';
import { File } from '@ionic-native/file';
import { Camera } from '@ionic-native/camera';
import { BarcodeScanner } from "@ionic-native/barcode-scanner";

(<any>window).startup = new Date().getTime();

@NgModule({
	declarations: [
		MyApp
	],
	imports: [
		IonicModule.forRoot(MyApp),
		BrowserModule,
	],
	bootstrap: [IonicApp],
	entryComponents: [
		MyApp,
	],
	providers: [
		{provide: ErrorHandler, useClass: IonicErrorHandler},
		DatePipe,
		BarcodeScanner,
		SplashScreen,
		StatusBar,
		Globalization,
		Push,
		PhotoViewer,
		ImagePicker,
		File,
		Camera
	]
})
export class AppModule {
	tasks: any[] = []
	taskRunnerStarted: Boolean = false

	startTaskRunner = () => {
		if (this.taskRunnerStarted || this.tasks.length === 0) {
			return
		}

		this.taskRunnerStarted = true
		setTimeout(this.runTasks, 0)
	}

	runTasks = () => {
		this.taskRunnerStarted = false

		const tasksStarted = Date.now()
		const maxTaskCount = this.tasks.length

		for (let i = 0; i < maxTaskCount; i += 1) {
			const task = this.tasks.shift()
			task()

			const dateDiff = Date.now() - tasksStarted

			if (dateDiff > 50) {
				console.error(`Long running task detected ${dateDiff}`, task)
			}

			if (i + 1 !== maxTaskCount && dateDiff > 20) {
				// console.warn(`Breaking out of tasks loop ${i+1} / ${maxTaskCount} / ${this.tasks.length}: ${dateDiff}`)
				break;
			}
		}

		this.startTaskRunner()
	}

	runInAngularZone(fn) {
		if((<any>this.zone).inner !== (<any>window).Zone.current) {
			this.zone.run(fn)
			return
		}

		fn()
	}

	constructor(private zone: NgZone) {
		Bluebird.setScheduler((fn) => {
			this.tasks.push(fn)

			this.runInAngularZone(this.startTaskRunner)
		});
	}
}
