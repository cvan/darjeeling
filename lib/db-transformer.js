var fs = require('fs');
var path = require('path');

var _ = require('lodash');
var request = require('request');
var Promise = require('es6-promise').Promise;


function generateFilename(url) {
  // Generates a pretty filename from a remote URL, something like this:
  // `97310-modified_1366438278.png`
  var fn = path.basename(url);
  if (fn.indexOf('?') > -1) {
    var fnChunks = fn.split('?');
    var fnBase = fnChunks[0].split('.');
    var fnExt = fnBase.pop();
    fn = fnBase.join('.') + '-' + fnChunks[1].replace('=', '_') + '.' + fnExt;
  }
  return fn;
}

module.exports = function (settings, data) {
  return new Promise(function (resolveDB, rejectDB) {
    var images = {};

    data = data.apps.map(function (app) {
      app._id = app.id;
      app.icon = app.icons['64'];
      app.previews = [
        {
          image: app.previews[0].image_url,
          // thumb: app.previews[0].thumbnail_url
        }
      ];

      // Collect a list of image URLs (to later download to disk).
      // key = URL, value = directory name
      images[app.icon] = 'icons';
      app.previews.forEach(function (preview) {
        images[preview.image] = 'screenshots-full';
        // images[preview.thumb] = 'screenshots-thumbs';
      });

      // Flatten object of localised name to one key for easy searching.
      app.name_search = [];
      Object.keys(app.name).forEach(function (locale) {
        app.name_search.push(app.name[locale]);
      });
      app.name_search = app.name_search.join(' ').replace(/\(|\)/g, '');

      // Flatten object of localised name to one key for easy searching.
      app.description_search = [];
      Object.keys(app.description).forEach(function (locale) {
        app.description_search.push(app.description[locale]);
      });
      app.description_search = app.description_search.join(' ').replace(/\(|\)/g, '');

      return _.pick(app, [
        '_id',
        'author',
        'content_ratings',
        'description',
        'description_search',
        'icon',
        'is_packaged',
        'manifest_url',
        'name',
        'name_search',
        'previews',
        'privacy_policy',
        'ratings',
        'slug',
        'status'
      ]);
    });

    console.log('Transformed data');

    console.log('Fetching images to save to disk');

    var promises = [];

    _.uniq(Object.keys(images)).forEach(function (url) {
      promises.push(new Promise(function (resolve, reject) {
        console.log('Saving', url);
        var fn = path.join(settings.downloads_dir, images[url], generateFilename(url));

        // Update filename.
        images[url] = path.relative(settings.frontend_dir, fn);

        var req = request(url).pipe(fs.createWriteStream(fn));
        req.on('close', function () {
          resolve();
        }).on('error', function () {
          reject();
        });
      }));
    });

    Promise.all(promises).then(function () {
      data = data.map(function (app) {
        app.icon = images[app.icon];
        app.previews = app.previews.map(function (preview) {
          preview.image = images[preview.image];
          // preview.thumb = images[preview.thumb];
          return preview;
        });
        return app;
      });

      fs.writeFile(settings.appcache_media,
        JSON.stringify(_.values(images).sort(), null, 2));

      console.log('Successfully saved all images to disk');
      resolveDB(data);
    }, function (err) {
      console.error('Failed to save images to disk:', err);
      rejectDB(err);
    });
  });
};
