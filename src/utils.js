const stream = require("stream");
const AWS = require("aws-sdk");
const archiver = require("archiver");

const s3 = new AWS.S3({ apiVersion: "2006-03-01" });

//method to fetch all files inside a given prefix from S3 bucket:

exports.getFilesInsidePrefix = (Bucket, Prefix) =>
	new Promise((resolve, reject) => {
		s3.listObjectsV2({ Bucket, Prefix }, (err, data) => {
			if (err) {
				reject(err);
			} else {
				//remove first element  (it's the prefix)
				data.Contents.shift();
				//return list of file names inside prefix:
				resolve(data.Contents.map((file) => file.Key.split("/").pop()));
			}
		});
	});

//method to convert an s3 key into an object containing file name and file data as buffers:
exports.getFileBufferData = (Bucket, Key) =>
	new Promise((resolve, reject) => {
		s3.getObject({ Bucket, Key }, (err, data) => {
			if (err) {
				reject(err);
			} else {
				resolve({
					name: Key.split("/").pop(),
					data: data.Body,
				});
			}
		});
	});

//method to create the zip archive:

exports.createZipArchive = (fileBuffers, Bucket, outputFileKey) =>
	new Promise((resolve, reject) => {
		//getting the output stream using which we will write the zip file to s3:
		const outputStreamS3 = getOutputStream(Bucket, outputFileKey);

		//promise gets resolved when the zip file is fully written to s3:
		outputStreamS3.on("close", resolve);
		outputStreamS3.on("end", resolve);
		outputStreamS3.on("error", reject);

		//initializing the zip archive:
		const archive = archiver("zip");
		archive.on("error", (err) => reject(err));

		//append the files from the file list to the archive:
		for (let i = 0; i < fileBuffers.length; i++) {
			archive.append(fileBuffers[i].data, { name: fileBuffers[i].name });
		}

		//piping archive's stream into the output stream:
		archive.pipe(outputStreamS3);

		//finalize the archive:
		archive.finalize();
	});

//utility method to return the output stream associated with the zip file on s3:
const getOutputStream = (Bucket, Key) => {
	const passThroughStream = new stream.PassThrough();
	s3.upload({ Bucket, Key, Body: passThroughStream }, (err, data) => {
		if (err) {
			throw err;
		}
	}).on("httpUploadProgress", (progress) => {
		const percentage = Math.round((progress.loaded * 100) / progress.total);
		console.log(`${percentage}% uploaded`);
	});

	return passThroughStream;
};
