import * as Bluebird from 'bluebird';

import socketService from "../services/socket.service"

import ObjectLoader from "../services/objectLoader"

import ChunkLoader from "./chatChunk"
import MessageLoader from "./message"

import h from "../helper/helper"

const unreadChatIDs = []

/*
- object is added to by id as soon as we receive it (definitly)
- question: add object to list after it is verified or as soon as it is received (with a flag "loading")


-> verify chunk chain between all chunks under one chat!
-> add message to chat (but verify parent chunk is under said chat and verify parent chunk!)
->
*/

const addAfterTime = (arr:timeArray, id: any, time: number) => {
	const firstLaterIndex = arr.findIndex((ele) => ele.time > time)

	return [
		...arr.slice(0, firstLaterIndex),
		{ id, time },
		...arr.slice(firstLaterIndex)
	]
}

type timeArray = {
	id: any,
	time: number
}[]

export class Chat {
	//Sorted IDs
	private messages:timeArray = []
	private chatUpdates:timeArray = []
	private messagesAndUpdates:timeArray = []

	// Unsorted IDs
	private chunkIDs: number[] = []
	private unreadMessageIDs: number[] = []

	private id: number

	private loadingInfo: {
		latestMessageID: number,
		latestChunkID: number
	}

	constructor({ id, latestMessageID, latestChunkID, unreadMessageIDs }) {
		this.id = id

		this.loadingInfo = {
			latestMessageID: latestMessageID,
			latestChunkID: latestChunkID,
		}

		this.unreadMessageIDs = unreadMessageIDs
	}

	isUnread() {
		return unreadChatIDs.indexOf(this.id) > -1
	}

	addMessageID = (id, time) => {
		const alreadyAdded = this.messages.find((message) => message.id === id)

		if (alreadyAdded) {
			return
		}

		this.messages = addAfterTime(this.messages, id, time)
		this.messagesAndUpdates = addAfterTime(this.messagesAndUpdates, { type: "message", id }, time)
	}

	addChatUpdateID = (id, time) => {
		const alreadyAdded = this.chatUpdates.find((chatUpdate) => chatUpdate.id === id)

		if (alreadyAdded) {
			return
		}

		this.chatUpdates = addAfterTime(this.chatUpdates, id, time)
		this.messagesAndUpdates = addAfterTime(this.messagesAndUpdates, { type: "chatUpdate", id }, time)
	}

	load = h.cacheResult<Bluebird<any>>(() => {
		return Bluebird.all([
			MessageLoader.get(this.loadingInfo.latestMessageID),
			ChunkLoader.get(this.loadingInfo.latestChunkID)
		]).then(([latestMessage, latestChunk]) => {
			this.loadingInfo = null

			if (latestMessage.getChunkID() !== latestChunk.getID()) {
				// get chunks in between!
			}

			// load message chunk chain!
			// ensure chunk chain is valid!

			// add message id to list

			return latestMessage
		}).then((latestMessage) => {
			this.addMessageID(latestMessage.getID(), latestMessage.getServerTime())
		})
	})

	getMessages() {
		return this.messages
	}

	getMessagesAndUpdates() {
		return this.messagesAndUpdates
	}

	getChatUpdates() {
		return this.chatUpdates
	}

	getLatestChunk() {

	}

	markRead() {
		// call server mark read function
		this.unreadMessageIDs = []
		// unreadChatIDs.remove(this.id)
	}

	addUnreadMessage(id) {
		if (this.unreadMessageIDs.indexOf(id) === -1) {
			this.unreadMessageIDs.push(id)
		}

		if (unreadChatIDs.indexOf(this.id) === -1) {
			unreadChatIDs.push(this.id)
		}
	}

	getBursts() {

	}

	loadMoreMessages() {

	}

	getNewestMessage() {

	}
}

const loadHook = (chatResponse) => {
	const loadChunks = Bluebird.all(chatResponse.chunks.map((chunkData) =>
		ChunkLoader.load(chunkData)
	))

	const loadMessages = Bluebird.all(chatResponse.messages.map((messageData) =>
		MessageLoader.load(messageData)
	))

	const chat = new Chat(chatResponse.chat)

	return Bluebird.all([
		loadChunks,
		loadMessages,
	]).then(() => chat.load()).thenReturn(chat)
}

const downloadHook = (id) => {
	return socketService.emit("chat.get", { id })
}

const hooks = {
	downloadHook, loadHook
}

export default class ChatLoader extends ObjectLoader(hooks) {}
