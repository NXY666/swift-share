function calcDivideMod(a, b) { return [Math.floor(a / b), a % b]; }

function parseTime(time) {
	const pad2 = c => String(c).padStart(2, "0");
	const pad3 = c => String(c).padStart(3, "0");

	let hour, min, sec, ms, remain;

	[remain, ms] = calcDivideMod(time, 1000 /* 1e3 */);
	[remain, sec] = calcDivideMod(remain, 60);
	[hour, min] = calcDivideMod(remain, 60);
	return `${pad2(hour)}:${pad2(min)}:${pad2(sec)}.${pad3(ms)}`;
}

export class Dialogue {
	start;

	duration;

	content;

	constructor(start, duration, content) {
		this.start = start;
		this.duration = duration;
		this.content = content;
	}

	get end() {
		return this.start + this.duration;
	}

	get startString() {
		return parseTime(this.start);
	}

	get endString() {
		return parseTime(this.end);
	}

	clone() {
		return new Dialogue(this.start, this.duration, this.content);
	}

	between(start, end) {
		end = end ?? start;
		return this.start <= start && this.end >= end;
	}
}

export class Subtitle {
	dialogues;

	constructor(dialogues) {
		this.dialogues = dialogues;
	}

	get contents() {
		return this.dialogues.map(t => t.content);
	}

	get intervals() {
		let interval = [];
		for (let n = 0; n < this.dialogues.length - 1; n++) {
			let dialogue = this.dialogues[n];
			let nextDialogue = this.dialogues[n + 1];
			interval.push(nextDialogue.start - dialogue.end);
		}
		interval.push(0);
		return interval;
	}

	clone() {
		let newDialogues = this.dialogues.map(n => n.clone());
		return new Subtitle(newDialogues);
	}

	find(start, end) {
		for (let dialogue of this.dialogues) {
			if (dialogue.between(start, end)) {
				return dialogue;
			}
		}
		return null;
	}
}

function getDialogueTimestamps(dialogues) {
	let dialogueTimestampMap = new Map();
	for (let dialogue of dialogues) {
		dialogueTimestampMap.set(dialogue.start, true);
		dialogueTimestampMap.set(dialogue.end, true);
	}
	let timestamps = Array.from(dialogueTimestampMap.keys());

	timestamps.sort((a, b) => a - b);

	return timestamps;
}

function refactorDialogues(originDialogues) {
	let dialogueTimestamps = getDialogueTimestamps(originDialogues);
	let sectionContents = [];
	for (let i = 0; i < dialogueTimestamps.length - 1; i++) {
		let start = dialogueTimestamps[i];
		let end = dialogueTimestamps[i + 1];
		let contents = [];
		for (let originDialogue of originDialogues) {
			if (originDialogue.between(start, end)) {
				contents.push(originDialogue.content);
			}
		}

		if (contents.length > 0) {
			sectionContents.push({start, end, contents});
		}
	}
	let dialogues = [];
	for (let sectionContent of sectionContents) {
		let {start} = sectionContent;
		let duration = sectionContent.end - sectionContent.start;

		let content = sectionContent.contents.join('\n');

		dialogues.push(new Dialogue(start, duration, content));
	}
	return dialogues;
}

function deduplicateDialogues(dialogues) {
	let result = [];
	for (let dialogue of dialogues) {
		if (result.length === 0) {
			result.push(dialogue);
			continue;
		}

		let prevDial = result[result.length - 1];
		if (prevDial.end !== dialogue.start || prevDial.content !== dialogue.content) {
			result.push(dialogue);
			continue;
		}

		prevDial.duration += dialogue.duration;
	}
	return result;
}

function getDialogueDurationAdjustOffset(currDial, prevDial, nextDial) {
	let ratio = prevDial.duration / (prevDial.duration + nextDial.duration);
	let adjustedDuration = Math.floor(ratio * currDial.duration);
	let remainingDuration = currDial.duration - adjustedDuration;
	let largerDuration;
	let smallerDuration;

	if (adjustedDuration > remainingDuration) {
		[largerDuration, smallerDuration] = [adjustedDuration, remainingDuration];
	} else {
		[largerDuration, smallerDuration] = [remainingDuration, adjustedDuration];
	}

	return prevDial.duration > nextDial.duration ? [smallerDuration, largerDuration] : [largerDuration, smallerDuration];
}

function adjustDialogues(dialogues, checkDialHandler) {
	let result = [];
	let index = 0;

	while (index < dialogues.length) {
		let currDial = dialogues[index];
		if (index === 0 || index === dialogues.length - 1) {
			result.push(currDial);
			index += 1;
			continue;
		}

		let prevDial = result[result.length - 1];
		let nextDial = dialogues[index + 1];
		if (prevDial.end !== currDial.start || currDial.end !== nextDial.start) {
			result.push(currDial);
			index += 1;
			continue;
		}

		if (!checkDialHandler(currDial, prevDial, nextDial)) {
			result.push(currDial);
			index += 1;
			continue;
		}

		let [prevOffset, nextOffset] = getDialogueDurationAdjustOffset(currDial, prevDial, nextDial);
		prevDial.duration += prevOffset;
		nextDial.duration += nextOffset;
		nextDial.start -= nextOffset;
		result.push(nextDial);
		index += 2;
	}

	return result;
}

function isCombinedDial(currDial, prevDial, nextDial) {
	return currDial.content === `${prevDial.content}\n${nextDial.content}`;
}

function extractTimestamps(subtitles) {
	let timestampMap = new Map();
	for (let subtitle of subtitles) {
		for (let dialogue of subtitle.dialogues) {
			timestampMap.set(dialogue.start, true);
			timestampMap.set(dialogue.end, true);
		}
	}
	let timestamps = Array.from(timestampMap.keys());

	timestamps.sort((a, b) => a - b);

	return timestamps;
}

function generateDialogues(subtitles) {
	let timestamps = extractTimestamps(subtitles);
	let sectionContents = [];
	for (let i = 0; i < timestamps.length - 1; i++) {
		let start = timestamps[i];
		let end = timestamps[i + 1];
		let contents = [];
		let found = false;
		for (let subtitle of subtitles) {
			let dialogue = subtitle.find(start, end);

			if (dialogue) {
				found = true;
				contents.push(dialogue.content);
			} else {
				contents.push("");
			}
		}

		if (found) {
			sectionContents.push({start, end, contents});
		}
	}
	let dialogues = [];
	for (let sectionContent of sectionContents) {
		let start = sectionContent.start;
		let duration = sectionContent.end - sectionContent.start;

		let content = sectionContent.contents.join('\n');

		dialogues.push(new Dialogue(start, duration, content));
	}
	return dialogues;
}

function isOverlappingContent(currCnt, prevCnt) {
	return currCnt === "" ? false : !!(
		currCnt.startsWith('\n') &&
		prevCnt.endsWith(currCnt) ||
		currCnt.endsWith('\n') &&
		prevCnt.startsWith(currCnt)
	);
}

function mergeOverlappingDialogues(dialogues) {
	let isMerged = false;
	for (let i = 1; i < dialogues.length; i++) {
		let currDial = dialogues[i];
		let prevDial = dialogues[i - 1];

		if (currDial.start === prevDial.end && currDial.content !== prevDial.content) {
			if (isOverlappingContent(currDial.content, prevDial.content)) {
				currDial.content = prevDial.content;
				isMerged = true;
			}
		}
	}
	for (let i = 0; i < dialogues.length - 1; i++) {
		let currDial = dialogues[i];
		let nextDial = dialogues[i + 1];

		if (currDial.end === nextDial.start && currDial.content !== nextDial.content) {
			if (isOverlappingContent(currDial.content, nextDial.content)) {
				currDial.content = nextDial.content;
				isMerged = true;
			}
		}
	}
	return isMerged;
}

function mergeAllOverlappingDialogues(dialogues) {
	dialogues = Array.from(dialogues);
	let isMerged = true;
	let attemptCount = 0;

	while (isMerged && attemptCount < 5) {
		isMerged = mergeOverlappingDialogues(dialogues);
		attemptCount += 1;
	}

	return dialogues;
}

function isDurationValid(currDur, prevDur, nextDur, maxDur) { return currDur <= prevDur && currDur <= nextDur && currDur <= maxDur; }

function isContentCombined(currCnt, prevCnt, nextCnt) {
	let contentLines = currCnt.split('\n');
	if (contentLines.length <= 1) {
		return false;
	}
	let lastLine = contentLines.pop();

	let remainingContent = contentLines.join('\n');

	return remainingContent === "" || lastLine === "" ? false : !!(
		prevCnt.startsWith(remainingContent) && nextCnt.endsWith(lastLine) ||
		prevCnt.endsWith(lastLine) && nextCnt.startsWith(remainingContent)
	);
}

function createCheckDialHandler(maxDuration) {
	return (currDial, prevDial, nextDial) => !(
		!isDurationValid(currDial.duration, prevDial.duration, nextDial.duration, maxDuration) ||
		!isContentCombined(currDial.content, prevDial.content, nextDial.content)
	);
}

function processSubtitle(subtitle) {
	let {dialogues} = subtitle.clone();
	dialogues = refactorDialogues(dialogues);
	dialogues = deduplicateDialogues(dialogues);
	dialogues = adjustDialogues(dialogues, isCombinedDial);
	return new Subtitle(dialogues);
}

function combineSubtitles(subtitles) {
	if (subtitles.length === 0) {
		return new Subtitle([]);
	}
	let [combinedSubtitle] = subtitles;
	for (let i = 1; i < subtitles.length; i++) {
		let dialogues = generateDialogues([combinedSubtitle, subtitles[i]]);
		dialogues = mergeAllOverlappingDialogues(dialogues);
		dialogues = deduplicateDialogues(dialogues);
		dialogues = adjustDialogues(dialogues, createCheckDialHandler(60 * 1000));
		combinedSubtitle = new Subtitle(dialogues);
	}
	return combinedSubtitle;
}

function superSplit(text, search, replace) {
	return text.replace(search, replace).split('\n');
}

class ChineseSubtitleFormatter {
	getWidth(t) {
		return t.length;
	}

	startsWithComma(t) {
		let n = /^[，、]/;
		return t.match(n) !== null;
	}

	startsWithPeriod(t) {
		let n = /^[。？！：；”」》）】)\]]/;
		return t.match(n) !== null;
	}

	startsWithSymbol(t) {
		return this.startsWithComma(t) || this.startsWithPeriod(t);
	}

	endsWithComma(t) {
		let n = /[，、]$/;
		return t.match(n) !== null;
	}

	endsWithPeriod(t) {
		let n = /[。？！：；”」》）】)\]♪]$/;
		return t.match(n) !== null;
	}

	endsWithSymbol(t) {
		return this.endsWithComma(t) || this.endsWithPeriod(t);
	}

	segment(text) {
		if (text.trim() === "") {
			return [text];
		}
		let endSign = /([，。？！：；、”」》）】)\]] *)/g;
		let startSign = /([“「《【([])/g;
		let segments = [];
		for (let r of superSplit(text, endSign, '$1\n')) {
			segments.push(...superSplit(r, startSign, '\n$1'));
		}
		return segments.filter(r => r !== "");
	}

	oneline(text) {
		let lines = text.split('\n').map(i => i.trim()).filter(i => i !== "");
		if (lines.length <= 1) {
			return lines.join("");
		}
		let unifiedIdeographRegexp = /\p{Unified_Ideograph}/u;
		let signRegexp = /[，。？！：；、“”「」《》（）【】]/;
		let parts = [];
		for (let i = 0; i < lines.length - 1; i++) {
			let line = lines[i];
			let nextLine = lines[i + 1];
			let prevLine = line[line.length - 1];
			let [firstChar] = nextLine;
			if (
				prevLine.match(unifiedIdeographRegexp) &&
				firstChar.match(unifiedIdeographRegexp) ||
				prevLine.match(signRegexp) ||
				firstChar.match(signRegexp)
			) {
				parts.push(line);
				continue;
			}
			parts.push(line, " ");
		}
		parts.push(lines[lines.length - 1]);
		return parts.join("");
	}

	pretty(text) {
		return text
		.replace(/(\p{Unified_Ideograph})([\w%#])/gu, "$1 $2")
		.replace(/([\w%#])(\p{Unified_Ideograph})/gu, "$1 $2");
	}
}

class EnglishSubtitleFormatter {
	getWidth(t) {
		return t.split(/\s/).length;
	}

	startsWithComma(t) {
		let n = /^,/;
		return t.match(n) !== null;
	}

	startsWithPeriod(t) {
		let n = /^[.?!:;"')\]”…]/;
		return t.match(n) !== null;
	}

	startsWithSymbol(t) {
		return this.startsWithComma(t) || this.startsWithPeriod(t);
	}

	endsWithComma(t) {
		let n = /,$/;
		return t.match(n) !== null;
	}

	endsWithPeriod(t) {
		let n = /[.?!:;"')\]”…♪]$/;
		return t.match(n) !== null;
	}

	endsWithSymbol(t) {
		return this.endsWithComma(t) || this.endsWithPeriod(t);
	}

	segment(t) {
		return [t];
	}

	oneline(t) {
		return t.replace(/ ?\n/g, " ");
	}

	pretty(t) {
		return t;
	}
}

const SubtitleFormatter = {
	chinese: new ChineseSubtitleFormatter(),
	english: new EnglishSubtitleFormatter()
};

function chooseSubtitleFormatter(langCode) {
	langCode = langCode.toLowerCase().replace("_", "-").trim();
	return langCode.match(/^zh\b/) || langCode.match(/^ja\b/) ? SubtitleFormatter.chinese : SubtitleFormatter.english;
}

function formatSubtitle(subtitle, langCode) {
	subtitle = subtitle.clone();
	let formatter = chooseSubtitleFormatter(langCode);
	for (let dialogue of subtitle.dialogues) {
		let content =
			dialogue.content
			.replaceAll("{\\an8}", "")
			.split('\n')
			.map(t => t.trim())
			.filter(t => t !== "")
			.join('\n');
		content = formatter.oneline(content);
		content = formatter.pretty(content);
		dialogue.content = content;
	}
	return subtitle;
}

function cloneSubtitle(subtitle, langCode) {
	subtitle = processSubtitle(subtitle);
	subtitle = formatSubtitle(subtitle, langCode);
	return subtitle;
}

function formatContent(content) {
	let formattedLines = [];
	for (let contentEntry of content.split('\n').entries()) {
		let lineNumber = contentEntry[0] + 1;
		let trimmedContent = contentEntry[1].trim();

		if (trimmedContent !== "") {
			formattedLines.push(`<c.line${lineNumber}>${trimmedContent}</c>`);
		}
	}
	return formattedLines.join('\n');
}

function processDialogues(subtitles) {
	let combinedSubtitle = combineSubtitles(subtitles);
	let formattedDialogues = [];
	for (let dialogue of combinedSubtitle.dialogues) {
		let {start, duration} = dialogue;

		let formattedContent = formatContent(dialogue.content);
		formattedDialogues.push(new Dialogue(start, duration, formattedContent));
	}
	return new Subtitle(formattedDialogues);
}

function generateWEBVTTFile(subtitle) {
	let result = [];
	result.push("WEBVTT");
	result.push("");
	for (let dialogue of subtitle.dialogues) {
		let {startString, endString, content} = dialogue;
		result.push(`${startString} --> ${endString}`);
		result.push(content);
		result.push("");
	}
	return result.join('\n');
}

function generateWEBVTTBlobUrl(subtitle) {
	let buffer = generateWEBVTTFile(subtitle);
	let blob = new Blob([buffer], {type: "text/vtt; charset=utf-8"});
	return URL.createObjectURL(blob);
}

const LocalDisplayNames = new Intl.DisplayNames(navigator.languages, {
	type: "language",
	languageDisplay: "standard",
	fallback: "none"
});

function getLocalLangName(langCode) {
	langCode = langCode.toLowerCase().replaceAll("_", "-").trim();
	try {
		return LocalDisplayNames.of(langCode) ?? "";
	} catch {
		return "";
	}
}

function getFullLocalLangName(langName, langCode) {
	let localLangName = getLocalLangName(langCode);
	return localLangName === "" || langCode === "und"
		? langName !== ""
			? `${langCode} (${langName})`
			: langCode
		: langName.includes("Forced")
			? `${localLangName} (Forced)`
			: langName.includes("SDH")
				? `${localLangName} (SDH)`
				: localLangName;
}

function getFullOutputName(name, id) { return name.includes("(Forced)") || name.includes("(SDH)") ? name : `${name} (Var ${id})`; }

export class VideoTrackStation {
	player;

	entries;

	selectedIndexes;

	outputUrlsQueue;

	constructor(player) {
		this.player = player;
		this.entries = new Map();
		this.selectedIndexes = [-1, -1];
		this.outputUrlsQueue = [];
	}

	add(relation) {
		let {id, code, name, subtitle} = relation;

		let element = this.entries.get(id)?.element ?? document.createElement("track");
		this.entries.set(id, {id, code, name, subtitle, element});
	}

	reset() {
		if (this.entries.size === 0) {
			return false;
		}
		for (let entry of this.entries.values()) {
			let element = entry.element;

			if (element.isConnected) {
				element.remove();
			}
		}
		this.entries.clear();
		this.selectedIndexes = [-1, -1];
		return true;
	}

	async flushPlayer(tracks) {
		let fragment = document.createDocumentFragment();
		for (let track of tracks) {
			let {code, outputName, element} = track;

			let lastOutputUrl = track.outputUrls[track.outputUrls.length - 1];
			let kind = outputName.includes("(SDH)") ? "captions" : "subtitles";
			element.srclang = code;
			element.src = lastOutputUrl;
			element.label = outputName;
			element.kind = kind;

			if (!element.isConnected) {
				fragment.appendChild(element);
			}
		}
		this.player.appendChild(fragment);
	}

	async flushDualsub(entries) {
		let movieId = "";
		let items = [];
		for (let entry of entries) {
			items.push({
				code: entry.outputCode,
				name: entry.outputName,
				url: entry.outputUrls[0]
			});
		}
		let message = {
			name: "dualsub:set-manifest",
			args: {movieId, items}
		};
		window.postMessage(message, location.origin);
	}

	addOutputUrls(outPutUrls) {
		while (this.outputUrlsQueue.length > 1) {
			let outputUrls = this.outputUrlsQueue.shift();
			for (let outputUrl of outputUrls) {
				URL.revokeObjectURL(outputUrl);
			}
		}

		this.outputUrlsQueue.push(outPutUrls);
	}

	async flush() {
		let outputs = [];
		let codeCountMap = {};
		for (let relation of this.entries.values()) {
			let {code, name, subtitle} = relation;

			let outputCode = code;
			let outputName = getFullLocalLangName(name, code);
			let count = codeCountMap[code] ?? 0;

			if (count > 0) {
				outputCode = `${outputCode}.var${count}`;
				outputName = getFullOutputName(outputName, count);
			}

			codeCountMap[code] = count + 1;
			let outputSubtitle = cloneSubtitle(subtitle, code);
			let outputUrls = [];
			outputs.push({...relation, outputCode, outputName, outputSubtitle, outputUrls});
		}
		let outputUrls = [];
		let currOutput = outputs[this.selectedIndexes[0]];
		for (let output of outputs) {
			let subtitleCombinations = [];
			subtitleCombinations.push([output.outputSubtitle]);

			if (currOutput !== undefined && currOutput !== output) {
				subtitleCombinations.push([output.outputSubtitle, currOutput.outputSubtitle]);
			}

			for (let subtitleCombination of subtitleCombinations) {
				let subtitle = processDialogues(subtitleCombination);
				let outputUrl = generateWEBVTTBlobUrl(subtitle);
				output.outputUrls.push(outputUrl);
				outputUrls.push(outputUrl);
			}
		}
		await this.flushPlayer(outputs);
		await this.flushDualsub(outputs);
		this.addOutputUrls(outputUrls);
	}

	onTrackChange(index) {
		if (this.selectedIndexes[1] !== index) {
			this.selectedIndexes[0] = this.selectedIndexes[1];
			this.selectedIndexes[1] = index;
			this.flush().then();
		}
	}
}
