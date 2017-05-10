import TopicUpdate from "./topicUpdate"
import * as Bluebird from "bluebird"

export default class TopicTitleUpdate extends TopicUpdate {
	constructor(updateData) {
		super(updateData)

		this.state = {
			...this.state,
			title: ""
		};
	}

	load() {
		return Bluebird.try(async () => {
			const content = await super.load()

			this.setState({
				title: content.title,
				loading: false
			});

			return content;
		})
	}

	getTitle = () => {
		return this.load().then((content) => {
			return content.title;
		});
	};

	static create(topic, previousTopicUpdate, title = "") {
		return super.create(topic, previousTopicUpdate, { content: { title }})
	}
}
