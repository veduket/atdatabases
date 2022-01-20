import {promises} from 'fs';
import {join} from 'path';
import {createHash} from 'crypto';
import {sync as mkdirp} from 'mkdirp';
import PrintContext from './PrintContext';

export default async function writeFiles<TypeID>({
  directory,
  context,
  generatedStatement,
}: {
  context: PrintContext<TypeID>;
  directory: string;
  generatedStatement: string;
}) {
  const files = context.getFiles();
  const filenames = new Set(files.map((f) => f.filename));
  mkdirp(directory);

  // delete files that would no longer be output
  await Promise.all(
    (
      await promises.readdir(directory)
    )
      .filter((fileName) => !filenames.has(fileName))
      .map(async (fileName) => {
        const filePath = join(directory, fileName);
        if ((await promises.stat(filePath)).isFile()) {
          const src = await promises.readFile(filePath, 'utf8');
          if (src.includes(generatedStatement)) {
            console.info(`Deleting: ${fileName}`);
            await promises.unlink(filePath);
          }
        }
      }),
  );

  await Promise.all(
    files.map(async (f) => {
      const filename = join(directory, f.filename);
      if (filename.endsWith(`.ts`)) {
        const content = f.content.trim();
        const checksum = `Checksum: ${createHash('sha512')
          .update(content)
          .digest('base64')}`;
        try {
          const existingSource = await promises.readFile(filename, 'utf8');
          if (existingSource.includes(checksum)) {
            return;
          }
          console.info(`Updating: ${f.filename}`);
        } catch (ex: any) {
          if (ex.code !== 'ENOENT') {
            throw ex;
          }
          console.info(`Writing: ${f.filename}`);
        }
        await promises.writeFile(
          filename,
          [
            `/**`,
            ` * !!! This file is autogenerated do not edit by hand !!!`,
            ` *`,
            ` * ${generatedStatement}`,
            ` * ${checksum}`,
            ' */',
            '',
            `/* eslint-disable */`,
            `// tslint:disable`,
            ``,
            content,
            '',
          ].join('\n'),
        );
      } else {
        try {
          const existingSource = await promises.readFile(filename, 'utf8');
          if (existingSource === f.content) {
            return;
          }
          console.info(`Updating: ${f.filename}`);
        } catch (ex: any) {
          if (ex.code !== 'ENOENT') {
            throw ex;
          }
          console.info(`Writing: ${f.filename}`);
        }
        await promises.writeFile(filename, f.content);
      }
    }),
  );
}
