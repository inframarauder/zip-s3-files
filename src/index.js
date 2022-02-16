"use strict";
const {
	getFileBufferData,
	getFilesInsidePrefix,
	createZipArchive,
} = require("./utils");

exports.zipFilesFromS3 = async (event) => {
	const { Bucket, Prefix } = event.body;

	//Bucket and Prefix are mandatory
	if (!Bucket || !Prefix) {
		return {
			statusCode: 400,
			body: JSON.stringify({
				message: "Bucket and Prefix are required",
			}),
		};
	}

	try {
		//get list of files inside prefix
		const files = await getFilesInsidePrefix(Bucket, Prefix);

		//get file buffers:
		let fileBuffers = [];
		for (let i = 0; i < files.length; i++) {
			//dont need already existing archive.zip (if it exists):
			if (files[i] !== "archive.zip") {
				const Key = `${Prefix}/${files[i]}`;
				const fileBuffer = await getFileBufferData(Bucket, Key);
				fileBuffers.push(fileBuffer);
			}
		}

		const outputFileKey = `${Prefix}/archive.zip`; // this is where the zip file will be stored

		//create the zip archive:
		await createZipArchive(fileBuffers, Bucket, outputFileKey);

		return {
			statusCode: 200,
			body: JSON.stringify({
				message: "Successfully zipped files!",
			}),
		};
	} catch (error) {
		return {
			statusCode: 500,
			body: JSON.stringify({
				message: error.message,
			}),
		};
	}
};
