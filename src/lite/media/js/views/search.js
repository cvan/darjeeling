define('views/search',
       ['apps', 'content-ratings', 'dom', 'indexing', 'install', 'log', 'notification', 'pages', 'settings', 'storage', 'templating', 'url', 'utils', 'worker'],
       function(apps, iarc, $, indexing, install, log, notification, pages, settings, storage, templating, url, utils, worker) {
  var cache = indexing.cache;
  var console = log('search');
  var docs;
  var GET;
  var q = '';
  var previousQuery = null;
  var previousResults = null;
  var timeStart;

  worker.addEventListener('message', function (e) {
    switch (e.data.type) {
    case 'results':
      return renderResults(e.data.data);
    }
  });

  function init() {
    console.log('Initializing search page...');

    var page_name = 'search' + (q ? '-' + q : '');
    if (document.body.dataset.page === page_name) {
      // Bail if we've already rendered this page.
      return search();
    }

    templating.render('browse', {page: page_name}, function(res) {
      $('main').innerHTML = res;
      console.log('Done rendering browse template, now waiting for indexed promise...');
      install.init().then(function(data) {
        docs = install.getDocs();
        // Initialize and then render search template.
        document.body.className = 'results';
        document.body.dataset.page = 'results';
        GET = utils.parseQueryString();
        reset();
        if (GET.q) {
          q.value = GET.q;
        }
        search();
        install.hideSplash();
      });
    });
  }

  function search() {
    timeStart = window.performance.now();

    var query = q.value || '';

    if (previousQuery === query) {
      // Bail if the query hasn't changed.
      console.log('Skipping rendering search results since search query has not changed');
      return;
    }
    previousQuery = query;

    console.log('Queueing search for "' + query + '"');

    if (cache.exists(query)) {
      console.log('Searching cache for "' + query + '"');
      var results = cache.get(query);
      results.timeStart = timeStart;
      renderResults(results);
    } else {
      worker.postMessage({
        type: 'search',
        data: {
          query: query,
          timeStart: timeStart
        }
      });
    }
  }

  function reset() {
    if (!q) {
      q = $('input[name=q]');
    }
    q.value = previousQuery = previousResults = null;
  }

  function renderResults(data) {
    console.log('Rendering results');

    data.timing = window.performance.now() - data.timeStart;

    if (!q) {
      q = $('input[name=q]');
    }

    // Update location bar based on search term.
    GET = utils.parseQueryString();
    GET.q = q.value || '';
    var serialized = utils.serialize(GET);
    var dest = serialized ? ('/search/?' + serialized) : '/';  // FIXME: compatibility with Marketplace, which uses /search?q=, would be nice.
    if (window.location.href !== dest) {
      window.history.replaceState({}, pages.getTitle('/'), dest);
    }

    templating.render('results-header', {data: data}, function(res) {
      $('main header').innerHTML = res;
    });

    var current = data.results.map(function(x) {
      return x.doc._id;
    });

    var previous = previousResults ? previousResults.results.map(function(x) {
      return x.doc._id;
    }) : [];

    if (!utils.eq(current, previous)) {
      // Only re-render results if results have changed.
      templating.render('results', {data: data, docs: install.getDocs()}, function(res) {
        // Override body classname, I don't use classList because I'm lazy and
        // don't want to figure out what to remove.
        document.body.className = 'results ' + (dest === '/' ? 'homepage' : 'search');
        $('main ol').innerHTML = res;
      });
    }

    if (!cache.exists(data.query)) {
      console.log('Caching "' + data.query + '"');
      cache.set(data.query, data);
    }

    previousResults = data;
  }

  $.delegate('input', 'input[name=q]', function() {
    $.each($('.category-nav li'), function(e) {
      if (e.classList.contains('active')) {
        e.classList.remove('active');
      }
    });
    search();
  }, false);

  $.delegate('click', 'input[name=q] ~ .search-clear', function () {
    // Clear search box and re-render search results.
    reset();
    $('.category-nav .home').classList.add('active');
    search();
  });

  $.delegate('click', '.logo, .category-nav li', function () {
    // Clear search box when going to category tab.
    reset();
  });

  $.delegate('submit', 'form', function(e) {
    e.preventDefault();
    search();
  });

  $.delegate('click', '.truncated-more', function(e) {
    e.target.nextElementSibling.classList.remove('hidden');
    e.target.parentNode.removeChild(e.target);
  });

  $.delegate('click', '.toggle-view-wrap', function(e) {
    e.preventDefault();
    $('main').classList.toggle('expanded');
    if (e.target.classList.contains('toggle-view-wrap')) {
      e.target.firstElementChild.classList.toggle('expanded');
    } else {
      e.target.classList.toggle('expanded');
    }
  });

  return {
    init: init,
    renderResults: renderResults,
    reset: reset
  };
});
