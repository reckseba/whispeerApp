import { Component, ViewChild } from "@angular/core"

import { NavController, Content, IonicPage } from "ionic-angular"

import { TranslateService } from '@ngx-translate/core'

import messageService from "../../lib/messages/messageService"
import Memoizer from "../../lib/asset/memoizer"

const contactsService = require("../../lib/services/friendsService")

import ChunkLoader from "../../lib/messages/chatChunk"
import MessageLoader from "../../lib/messages/message"
import ChatLoader from "../../lib/messages/chat"

const chatMemoizer = {}

// Amount of chats after we don't load more initially
// Considered to be at least one filled screen
const CHATS_PER_SCREEN = 10

const getChatMemoizer = (chatID) => {
	if (!chatMemoizer[chatID]) {
		chatMemoizer[chatID] = new Memoizer([
			() => ChatLoader.getLoaded(chatID),
			() => ChatLoader.getLoaded(chatID).getLatestChunk(),
			() => ChatLoader.getLoaded(chatID).getLatestMessage(),
			() => ChatLoader.getLoaded(chatID).getUnreadMessageIDs()
		], (chat, latestChunkID, latestMessageID, unreadMessageIDs, previousValue) => {
			const latestChunk = ChunkLoader.getLoaded(chat.getLatestChunk())

			const info = previousValue || { id: chat.getID() }

			info.id = chat.getID()
			info.unread = chat.getUnreadMessageIDs().length > 0
			info.unreadCount = chat.getUnreadMessageIDs().length

			info.partners = latestChunk.getPartners()
			info.partnersDisplay = latestChunk.getPartnerDisplay()
			info.title = latestChunk.getTitle()
			info.time = latestChunk.getTime()
			info.type = latestChunk.getReceiver().length > 2 ? "groupChat" : "peerChat"

			if (!MessageLoader.isLoaded(latestMessageID)) {
				info.latestMessageText = ""
			} else {
				const latestMessage = MessageLoader.getLoaded(latestMessageID)

				info.time = latestMessage.getTime()
				info.latestMessageText = latestMessage.getText()
			}

			return info
		})
	}

	return chatMemoizer[chatID]
}

@IonicPage({
	name: "Home",
	segment: "home"
})
@Component({
	selector: 'page-home',
	templateUrl: 'home.html'
})
export class HomePage {
	@ViewChild(Content) content: Content

	topics: any[] = []
	requests: any[] = []
	searchTerm: string = ""

	chatsLoading: boolean = true
	moreTopicsAvailable: boolean = true

	lang: string = "en"

	numberOfChatsToDisplay = 0

	constructor(public navCtrl: NavController, private translate: TranslateService) {}

	ngOnInit() {}

	ionViewDidEnter = () => {
		// this should hide the search bar
		// but it runs too early when redirected from login. (works in messages...)
		// another problem is that the search bars have different heights.

		//this.content.scrollTo(0, 58, 0)
		this.loadTopics()
		this.loadRequests()

		const en = (this.translate.currentLang.toLowerCase().indexOf("de") === -1)
		this.lang = en ? "en" : "de"
	}

	loadTopics = () => {
		console.warn("load more chats?", this.getLoadedChats().length)
		if (this.getLoadedChats().length >= CHATS_PER_SCREEN) {
			return
		}

		messageService.loadMoreChats(CHATS_PER_SCREEN).then((chats) => {
			this.moreTopicsAvailable = !messageService.allChatsLoaded
			this.chatsLoading = false
			this.numberOfChatsToDisplay += chats.length
		})
	}

	getChatCount = () => messageService.getChatIDs().length

	getLoadedChats = () =>
		messageService.getChatIDs()
			.filter((chatID) => ChatLoader.isLoaded(chatID))
			.filter((id, i) => i < this.numberOfChatsToDisplay)
			.map((chatID) => getChatMemoizer(chatID).getValue())
			.sort((a, b) => b.time - a.time)

	showNoConversationsPlaceholder = () => !this.chatsLoading && this.getChatCount() === 0

	loadMoreTopics = (infiniteScroll) => {
		if (this.chatsLoading) {
			infiniteScroll.complete()
			return
		}

		messageService.loadMoreChats(CHATS_PER_SCREEN).then((chats) => {
			this.moreTopicsAvailable = !messageService.allChatsLoaded
			this.numberOfChatsToDisplay += chats.length
			infiniteScroll.complete()
		})
	}

	updateRequests = () => {
		this.requests = contactsService.getRequests()
	}

	loadRequests = () => {
		contactsService.awaitLoading().then(() => {
			this.updateRequests()
			contactsService.listen(this.updateRequests)
		})
	}

	get requestsLabel() {
		const count = this.requests.length > 1 ? "many" : "single"

		return this.translate.instant(`home.newContact.${count}`)
	}

	openContactRequests = () => {
		this.navCtrl.push("Requests")
	}

	openChat = (chatID: number) => {
		this.navCtrl.push("Messages", { chatID: chatID })
	}

	newMessage = () => {
		this.navCtrl.push("New Message", {}, {
			animation: "md-transition"
		})
	}
}
