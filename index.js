#!/usr/bin/env node

var cheerio = require('cheerio');
var md = require('html-md');
var fs = require('fs');
var argv = require('yargs').argv;
var child_process = require('child_process');

var attachmentsPrefixRE = /(\]\()attachments/g;
var htmlExtesionRE = /\.html?$/;

function filterFileHtml(name) {
	return htmlExtesionRE.test(name);
}

function convertHtml(fileContent) {
	var html = cheerio.load(fileContent);
  var path = [];

	html("[src^='images/icons']").remove();
	html('#footer').remove();
  html('ol#breadcrumbs').find('li').each(function() {
    var dir = html(this).find('a').text();
    if (! dir.match(/^Infrastructure/)) {
      path.push(createFileName(dir));
    }
  });
  html('a').each(function() {
    if (html(this).attr('href')) {
      var href = html(this).attr('href');
      if (href.match(/_\d{8}\.html/)) {
        html(this).attr('href', createFileName(href));
      }
    }
  });

	html('#breadcrumb-section').remove();
	html('.page-metadata').remove();
	html('span').replaceWith(function() { return html(this).contents(); });
	html('pre').replaceWith(function() { return '<pre><code>' + html(this).contents() + '</code></pre>'; });
  html('div.pageSection.group:contains("Comments:")').remove();

  // remove paragraph elements from tables, as these prohibit pandoc from
  // rendering the table with markdown
  html('table').find('p').replaceWith(function() { return html(this).contents() });

  attachmentsSelector = 'div.pageSection.group:contains("Attachments:")'
  html(attachmentsSelector).find('a').each(function() {
    attachmentInContent = html('div#main-content').find(
      '[href="' + html(this).attr('href') + '"],[src="' + html(this).attr('href') + '"]'
    );
    if (attachmentInContent.length > 0) {
      html(this).remove();
    }
  });
  remainingAttachments = html(attachmentsSelector).find('a')
  if (remainingAttachments.length == 0) {
    html(attachmentsSelector).remove();
  } else {
    var attachments = html('<ul>');
    attachments.attr('id', 'attachments');
    html(attachmentsSelector).find('a').each(function() {
      attachments.append("<li>" + html(this) +"</li>");
    });
    html(attachmentsSelector).replaceWith(attachments);
    html('#attachments').before('<h2>Attachments:</h2>');
  }

	html('img').replaceWith(
		function() {
			var e = html('<img>');
			e.attr('src', html(this).attr('src'));
			e.attr('height', html(this).attr('height'));
			e.attr('width', html(this).attr('width'));
			e.attr('alt', html(this).attr('alt'));
			return e;
		}
	);
	html('a').replaceWith(
		function() {
			var e = html('<a>');
			e.attr('href', html(this).attr('href'));
			e.text(html(this).text());
			return e;
		}
	);

  var cleanedTitle = html('#title-heading').text().replace(argv.titleClean, '');

	if (argv.titleClean) {
    html('#title-heading').replaceWith(
      function() {
        var e = html('<h2>');
        e.text(cleanedTitle);
        return e;
      }
    );
	}

  //console.log(html.html());
  var markdown = child_process.execSync(
    'pandoc -f html -t markdown_github+link_attributes',
    { input: html.html(), encoding: 'utf8' }
  ).replace(/\n\s+$/, "\n");

  if (path.length == 0) {
    var filePath = '.';
  } else {
    var filePath = './' + path.join('/');
    markdown = markdown.replace(attachmentsPrefixRE, function(match, prefix) {
      return prefix + path.reduce(function(relPath, _) {
        return relPath + '../'
      }, '') + 'attachments';
    });
  }

	return { content: markdown, fileName: createFileName(cleanedTitle) + '.md', path: filePath };
}

function createFileName(name) {
    return name.trim()
    .replace(/_\d{8}\.html/g, '.html')
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
    .replace(/[^_.\w]/g, '');
}

function convertFile(name) {
	console.log('Converting: ', name);

	var fileContent = fs.readFileSync(name);
	var markdown = convertHtml(fileContent);

  child_process.execSync('mkdir -p ' + markdown.path);
	fs.writeFileSync(markdown.path + '/' + markdown.fileName, markdown.content);
	console.log('Wrote: ', markdown.path + '/' + markdown.fileName);
}

fs.readdirSync(process.cwd())
	.filter(filterFileHtml)
	.forEach(convertFile);
