const contactsService = require("../../lib/services/friendsService");
const userService = require("../../lib/users/userService").default;
import errorService from "../../lib/services/error.service";

import * as Bluebird from 'bluebird';

import h from "../helper/helper";

import Memoizer from "../../lib/asset/memoizer"

const filterContacts = (contacts, searchTerm) => {
	if (!searchTerm) {
		return contacts;
	}

	return contacts.filter((contact) => {
		return contact.names.searchName.indexOf(searchTerm) > -1;
	});
}

export class ContactsWithSearch {
	contacts: any[] = [];
	contactsLoading: boolean = true;

	searchResults: any[] = [];
	searchResultsLoading: boolean = false;

	loadedContactIDs: number[] = []

	searchTerm: string = "";

	private memoizer: Memoizer

	constructor() {
		this.memoizer = new Memoizer([
			() => this.contacts,
			() => this.searchResults,
			() => this.searchTerm
		], (contacts, searchResults, searchTerm) => {
			return filterContacts(contacts, searchTerm).concat(searchResults)
		})
	}

	static sort = (users) => users.sort((a: any, b: any): number => {
		const firstAvailable = a.names.firstname && b.names.firstname;
		const lastAvailable = a.names.lastname && b.names.firstname;

		if(!firstAvailable && !lastAvailable) {
			return a.name.localeCompare(b.name);
		} else if (!firstAvailable) {
			return a.names.lastname.localeCompare(b.names.lastname);
		} else {
			return a.names.firstname.localeCompare(b.names.firstname);
		}
	});

	protected loadContactsUsers = () => {
		var contacts = contactsService.getFriends();

		if (h.arrayEqual(this.loadedContactIDs, contacts)) {
			return Bluebird.resolve()
		}

		this.loadedContactIDs = contacts.slice()

		return userService.getMultipleFormatted(contacts)
			.then((result: any[]) => ContactsWithSearch.sort(result))
			.then((result: any[]) => this.contacts = result)
	}

	contactDividers = (record, recordIndex, records) => {
		const firstChar: string = record.name[0];

		if(recordIndex === 0) {
			if (this.searchTerm) {
				if (record.isMyFriend) {
					return "Contacts";
				} else {
					return "Global";
				}
			}

			return firstChar.toUpperCase();
		}

		const previousEntry = records[recordIndex - 1];

		if (this.searchTerm) {
			if (previousEntry.isMyFriend && !record.isMyFriend) {
				return "Global";
			}

			return null;
		}

		if(firstChar.toLowerCase() !== previousEntry.name[0].toLowerCase()) {
			return firstChar.toUpperCase();
		}

		console.log('return null')

		return null;
	}

	executeSearch = h.debounce(() => {
		this.searchResultsLoading = true;

		const query = this.searchTerm;
		const contacts = contactsService.getFriends();

		userService.query(query).bind(this).filter((user) => {
			return contacts.indexOf(user.getID()) === -1;
		}).map(function (user) {
			if (this.searchTerm !== query) {
				return;
			}

			return user.loadBasicData().thenReturn(user);
		}).then(function (users) {
			if (this.searchTerm !== query) {
				return;
			}

			return users.map(function (user) {
				user.loadBasicData().catch(errorService.criticalError);
				return user.data;
			});
		}).then((userData) => {
			this.searchResults = userData || [];
			this.searchResultsLoading = false;
		});
	}, 100)

	getUsers = () => {
		return this.memoizer.getValue()
	}
}
