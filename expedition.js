// Expedition Log: bookshelf (Goodreads), globe of places visited, and Last.fm listening.

(function () {
    'use strict';

    // Last.fm's read-only API key is meant to be used in the browser. Create one at
    // https://www.last.fm/api/account/create and paste the "API key" (not the shared secret) here.
    const LASTFM = { user: 'toney562', apiKey: '7454f6c38ac3e0ce8887c2ecc22f99d2' };

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const $ = (id) => document.getElementById(id);

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    const scripts = {};
    function loadScript(src) {
        if (!scripts[src]) {
            scripts[src] = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = src;
                s.onload = resolve;
                s.onerror = () => reject(new Error('Could not load ' + src));
                document.head.appendChild(s);
            });
        }
        return scripts[src];
    }

    function hash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
        return h;
    }

    // Close a dialog when its backdrop or close button is clicked
    document.querySelectorAll('.log-dialog').forEach((dialog) => {
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
        });
    });

    function whenNear(element, callback) {
        if (!('IntersectionObserver' in window)) return callback();
        const io = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) {
                io.disconnect();
                callback();
            }
        }, { rootMargin: '400px' });
        io.observe(element);
    }

    /* ------------------------------------------------------------------ */
    /* Bookshelf                                                           */
    /* ------------------------------------------------------------------ */

    const SPINE_COLORS = ['#1e3a5f', '#2b4c7e', '#1f5f5b', '#4a3b6b', '#5b2f4a', '#2f5d43', '#6b4a2b', '#283655', '#7a3b3b', '#3d5a6c'];
    let books = [];
    let bookIndex = 0;
    let rotY = 25;
    let rotX = -4;

    function spineColor(book) {
        return SPINE_COLORS[hash(book.title + book.author) % SPINE_COLORS.length];
    }

    function renderShelf(data) {
        const shelf = $('shelf');
        const reading = (data.currentlyReading || []).map((b) => ({ ...b, reading: true }));
        books = reading.concat(data.read || []);

        if (!books.length) {
            for (let i = 0; i < 9; i++) {
                const ghost = el('span', 'shelf-book ghost');
                ghost.style.height = 110 + (i * 37) % 45 + 'px';
                ghost.style.width = 24 + (i * 13) % 14 + 'px';
                ghost.setAttribute('aria-hidden', 'true');
                shelf.appendChild(ghost);
            }
            $('shelfEmpty').hidden = false;
            shelf.classList.add('is-empty');
            return;
        }

        $('shelfEmpty').remove();
        books.forEach((book, i) => {
            const spine = el('button', 'shelf-book' + (book.reading ? ' reading' : ''));
            spine.type = 'button';
            spine.style.setProperty('--spine', spineColor(book));
            spine.style.height = 118 + (hash(book.title) % 42) + 'px';
            spine.style.width = Math.max(22, Math.min(40, Math.round((book.pages || 320) / 13))) + 'px';
            spine.setAttribute('aria-label', `${book.title} by ${book.author}${book.reading ? ' (reading now)' : ''}`);
            spine.title = book.title;
            spine.appendChild(el('span', null, book.title));
            spine.addEventListener('click', () => openBook(i));
            shelf.appendChild(spine);
        });

        const meta = [];
        if (reading.length) meta.push(`${reading.length} reading`);
        if (data.read && data.read.length) meta.push(`${data.read.length} read`);
        $('shelfMeta').textContent = meta.join(' · ');
    }

    function setBookTransform() {
        $('book3d').style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
        if (typeof updateFlipLabel === 'function') updateFlipLabel();
    }

    function fillBook(book) {
        const scene = $('bookScene');
        const depth = Math.max(22, Math.min(56, Math.round((book.pages || 320) / 9)));
        scene.style.setProperty('--d', depth + 'px');
        scene.style.setProperty('--spine', spineColor(book));

        const front = $('bookFront');
        front.replaceChildren();
        if (book.cover) {
            const img = el('img');
            img.src = book.cover;
            img.alt = '';
            img.onerror = () => front.replaceChildren(madeCover(book));
            front.appendChild(img);
        } else {
            front.appendChild(madeCover(book));
        }

        $('bookSpine').textContent = book.title;

        const back = $('bookBack');
        back.replaceChildren();
        if (book.reading) {
            back.appendChild(el('strong', null, 'Reading now'));
        } else if (book.rating) {
            const stars = el('span', 'book-stars', '★'.repeat(book.rating) + '☆'.repeat(5 - book.rating));
            stars.setAttribute('aria-label', `${book.rating} out of 5 stars`);
            back.appendChild(stars);
        }
        const when = book.readAt ? 'Finished ' + formatMonth(book.readAt) : '';
        const details = [when, book.pages ? book.pages + ' pages' : ''].filter(Boolean).join(' · ');
        if (details) back.appendChild(el('span', null, details));
        back.appendChild(el('p', 'review', book.review || 'No review yet. Ask me about it!'));

        $('bookTitle').textContent = book.title;
        $('bookAuthor').textContent = book.author;
        const link = $('bookLink');
        link.hidden = !book.url;
        if (book.url) link.href = book.url;
        $('bookPrev').disabled = bookIndex === 0;
        $('bookNext').disabled = bookIndex === books.length - 1;
    }

    function madeCover(book) {
        const cover = el('div', 'made-cover');
        const title = el('strong', null, book.title);
        // the CSS sizes the title so this many characters fit on one line
        const longestWord = Math.max(...book.title.split(/\s+/).map((w) => w.length));
        title.style.setProperty('--title-chars', Math.max(longestWord, 9));
        cover.appendChild(title);
        cover.appendChild(el('small', null, book.author));
        return cover;
    }

    function formatMonth(iso) {
        const d = new Date(iso + 'T12:00:00');
        return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    }

    function openBook(i) {
        bookIndex = i;
        // start edge-on, like it was just pulled off the shelf, then turn to the cover
        rotY = reduceMotion ? 25 : 90;
        rotX = -4;
        const book3d = $('book3d');
        book3d.style.transition = 'none';
        setBookTransform();
        fillBook(books[i]);
        const dialog = $('bookDialog');
        if (!dialog.open) dialog.showModal();
        void book3d.offsetWidth;
        book3d.style.transition = '';
        rotY = 25;
        requestAnimationFrame(setBookTransform);
    }

    function showBook(i) {
        if (i < 0 || i >= books.length) return;
        bookIndex = i;
        fillBook(books[i]);
        rotY = 25;
        rotX = -4;
        setBookTransform();
    }

    function showingBack() {
        const r = ((rotY % 360) + 360) % 360;
        return r > 90 && r < 270;
    }

    function updateFlipLabel() {
        $('bookFlip').textContent = showingBack() ? 'Show the cover' : 'Flip it over';
    }

    $('bookFlip').addEventListener('click', () => {
        rotY += 180;
        setBookTransform();
        updateFlipLabel();
    });
    $('bookPrev').addEventListener('click', () => showBook(bookIndex - 1));
    $('bookNext').addEventListener('click', () => showBook(bookIndex + 1));
    $('bookDialog').addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') showBook(bookIndex - 1);
        else if (e.key === 'ArrowRight') showBook(bookIndex + 1);
    });

    // Drag to turn the book
    (function () {
        const scene = $('bookScene');
        let drag = null;
        scene.addEventListener('pointerdown', (e) => {
            drag = { x: e.clientX, y: e.clientY, rotY, rotX };
            scene.setPointerCapture(e.pointerId);
            scene.classList.add('dragging');
        });
        scene.addEventListener('pointermove', (e) => {
            if (!drag) return;
            rotY = drag.rotY + (e.clientX - drag.x) * 0.6;
            rotX = Math.max(-30, Math.min(30, drag.rotX - (e.clientY - drag.y) * 0.3));
            setBookTransform();
        });
        const end = () => {
            drag = null;
            scene.classList.remove('dragging');
        };
        scene.addEventListener('pointerup', end);
        scene.addEventListener('pointercancel', end);
    })();

    fetch('data/books.json', { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then(renderShelf)
        .catch(() => renderShelf({}));

    /* ------------------------------------------------------------------ */
    /* Globe                                                               */
    /* ------------------------------------------------------------------ */

    const VISITED_FILL = 'rgba(45, 212, 191, 0.85)';
    let places = [];
    let geoPromise = null;

    function loadGeo() {
        if (!geoPromise) {
            geoPromise = Promise.all([
                loadScript('vendor/topojson-client.min.js'),
                fetch('vendor/countries-110m.json').then((r) => r.json()),
                fetch('vendor/states-10m.json').then((r) => r.json()),
            ]).then(([, world, us]) => ({
                countries: topojson.feature(world, world.objects.countries).features
                    .map((f) => Object.assign(f, { kind: 'country' })),
                states: topojson.feature(us, us.objects.states).features
                    .map((f) => Object.assign(f, { kind: 'state' })),
            }));
        }
        return geoPromise;
    }

    function isVisited(f) {
        return places.some((p) => p.name === f.properties.name && (p.type === 'state') === (f.kind === 'state'));
    }

    function renderPlaces(data) {
        places = data.places || [];
        const states = places.filter((p) => p.type === 'state');
        const countries = places.filter((p) => p.type === 'country');
        const countryCount = countries.length + (states.length ? 1 : 0);
        const meta = `${states.length} states · ${countryCount} countries`;
        $('globeMeta').textContent = meta;
        $('globePanelMeta').textContent = meta;

        const list = $('placeList');
        list.replaceChildren();
        if (states.length) {
            list.appendChild(el('strong', null, 'US: '));
            list.appendChild(document.createTextNode(states.map((p) => p.name).join(', ')));
        }
        if (countries.length) {
            if (states.length) list.appendChild(el('br'));
            list.appendChild(el('strong', null, 'Abroad: '));
            list.appendChild(document.createTextNode(countries.map((p) => p.name).join(', ')));
        }

        const chips = $('globeChips');
        [['United States', states], ['Abroad', countries]].forEach(([label, group]) => {
            if (!group.length) return;
            const wrap = el('div', 'chip-group');
            wrap.appendChild(el('h4', null, label));
            const row = el('div', 'chips');
            group.forEach((p) => {
                const chip = el('button', 'chip', p.name);
                chip.type = 'button';
                chip.dataset.place = p.name;
                chip.setAttribute('aria-pressed', 'false');
                chip.addEventListener('click', () => selectPlace(p.name));
                row.appendChild(chip);
            });
            wrap.appendChild(row);
            chips.appendChild(wrap);
        });

        whenNear($('globeCard'), startPreview);
    }

    // Small spinning globe drawn on a 2D canvas, so the 3D library only loads on click
    function startPreview() {
        const canvas = $('globeCanvas');
        const ctx = canvas.getContext('2d');
        let lon0 = -98;
        const lat0 = 28;
        let geo = null;
        let running = false;
        let visible = true;
        let last = 0;

        function size() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = canvas.clientWidth * dpr;
            canvas.height = canvas.clientHeight * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function drawRings(rings, cx, cy, r, sinL0, cosL0) {
            let any = false;
            for (const ring of rings) {
                for (let i = 0; i < ring.length; i++) {
                    const lam = (ring[i][0] - lon0) * Math.PI / 180;
                    const phi = ring[i][1] * Math.PI / 180;
                    const cosPhi = Math.cos(phi);
                    let x = cosPhi * Math.sin(lam);
                    let y = cosL0 * Math.sin(phi) - sinL0 * cosPhi * Math.cos(lam);
                    const front = sinL0 * Math.sin(phi) + cosL0 * cosPhi * Math.cos(lam) > 0;
                    if (front) any = true;
                    else {
                        const len = Math.hypot(x, y) || 1;
                        x /= len;
                        y /= len;
                    }
                    const px = cx + x * r;
                    const py = cy - y * r;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
            }
            return any;
        }

        function drawFeature(f, fill, stroke, cx, cy, r, sinL0, cosL0) {
            const g = f.geometry;
            if (!g) return;
            const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
            for (const rings of polys) {
                ctx.beginPath();
                if (!drawRings(rings, cx, cy, r, sinL0, cosL0)) continue;
                ctx.fillStyle = fill;
                ctx.fill('evenodd');
                if (stroke) {
                    ctx.strokeStyle = stroke;
                    ctx.stroke();
                }
            }
        }

        function draw() {
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            const r = Math.min(w, h) / 2 - 14;
            const cx = w / 2;
            const cy = h / 2 - 6;
            ctx.clearRect(0, 0, w, h);

            const glow = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.25);
            glow.addColorStop(0, 'rgba(125, 211, 252, 0.25)');
            glow.addColorStop(1, 'rgba(125, 211, 252, 0)');
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, w, h);

            const ocean = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
            ocean.addColorStop(0, '#12305a');
            ocean.addColorStop(1, '#071429');
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = ocean;
            ctx.fill();

            if (geo) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.clip();
                ctx.lineWidth = 0.6;
                const sinL0 = Math.sin(lat0 * Math.PI / 180);
                const cosL0 = Math.cos(lat0 * Math.PI / 180);
                for (const f of geo.countries) {
                    const hit = isVisited(f);
                    drawFeature(f, hit ? VISITED_FILL : 'rgba(125, 211, 252, 0.16)', 'rgba(125, 211, 252, 0.35)', cx, cy, r, sinL0, cosL0);
                }
                for (const f of geo.states) {
                    if (isVisited(f)) drawFeature(f, VISITED_FILL, 'rgba(4, 18, 31, 0.6)', cx, cy, r, sinL0, cosL0);
                }
                ctx.restore();
            }

            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(125, 211, 252, 0.45)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        function frame(t) {
            if (!running) return;
            if (t - last > 33) {
                lon0 -= 0.25;
                last = t;
                draw();
            }
            requestAnimationFrame(frame);
        }

        function updateRunning() {
            const should = !reduceMotion && visible && !document.hidden && !$('globeDialog').open;
            if (should && !running) {
                running = true;
                requestAnimationFrame(frame);
            } else if (!should) {
                running = false;
            }
        }

        size();
        draw();
        new ResizeObserver(() => { size(); draw(); }).observe(canvas);
        new IntersectionObserver((entries) => {
            visible = entries[0].isIntersecting;
            updateRunning();
        }).observe(canvas);
        document.addEventListener('visibilitychange', updateRunning);
        $('globeDialog').addEventListener('close', updateRunning);
        $('globeOpen').addEventListener('click', updateRunning);

        loadGeo().then((g) => {
            geo = g;
            draw();
            updateRunning();
        }).catch(() => {});
    }

    let globe = null;
    let selected = null;

    function selectPlace(name) {
        selected = name;
        const place = places.find((p) => p.name === name);
        document.querySelectorAll('#globeChips .chip').forEach((chip) => {
            chip.setAttribute('aria-pressed', String(chip.dataset.place === name));
        });

        const panel = $('globeSelected');
        panel.replaceChildren();
        panel.appendChild(el('strong', null, name));
        const bits = [place.type === 'state' ? 'US state' : 'Country', place.year].filter(Boolean).join(' · ');
        panel.appendChild(el('span', null, bits));
        if (place.note) {
            panel.appendChild(el('br'));
            panel.appendChild(el('span', null, place.note));
        }

        if (globe) {
            globe.controls().autoRotate = false;
            globe.polygonAltitude(globe.polygonAltitude());
            globe.polygonCapColor(globe.polygonCapColor());
            globe.pointOfView({ lat: place.lat, lng: place.lng, altitude: place.type === 'state' ? 1.1 : 1.5 }, reduceMotion ? 0 : 1200);
        }
    }

    async function openGlobe() {
        const dialog = $('globeDialog');
        dialog.showModal();
        const stage = $('globeStage');
        const loading = $('globeLoading');

        if (globe) {
            globe.resumeAnimation();
            globe.width(stage.clientWidth).height(stage.clientHeight);
            return;
        }

        try {
            const [geo] = await Promise.all([loadGeo(), loadScript('vendor/globe.gl.min.js')]);
            const features = geo.countries.concat(geo.states);
            const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

            globe = new Globe(stage, { animateIn: !reduceMotion })
                .width(stage.clientWidth)
                .height(stage.clientHeight)
                .backgroundColor('rgba(0,0,0,0)')
                .showAtmosphere(true)
                .atmosphereColor('#7dd3fc')
                .atmosphereAltitude(0.2)
                .polygonsData(features)
                .polygonsTransitionDuration(reduceMotion ? 0 : 400)
                .polygonCapColor((f) => {
                    if (f.properties.name === selected && isVisited(f)) return '#99f6e4';
                    if (isVisited(f)) return VISITED_FILL;
                    return f.kind === 'state' ? 'rgba(125, 211, 252, 0.05)' : 'rgba(125, 211, 252, 0.14)';
                })
                .polygonSideColor((f) => (isVisited(f) ? 'rgba(45, 212, 191, 0.35)' : 'rgba(125, 211, 252, 0.04)'))
                .polygonStrokeColor(() => 'rgba(125, 211, 252, 0.35)')
                .polygonAltitude((f) => {
                    if (isVisited(f)) return f.properties.name === selected ? 0.05 : 0.02;
                    return f.kind === 'state' ? 0.009 : 0.006;
                })
                .polygonLabel((f) => `<div class="globe-tooltip"><b>${esc(f.properties.name)}</b>${isVisited(f) ? '<br>Been here' : ''}</div>`)
                .onPolygonHover((f) => { stage.style.cursor = f && isVisited(f) ? 'pointer' : ''; })
                .onPolygonClick((f) => { if (isVisited(f)) selectPlace(f.properties.name); });

            globe.globeMaterial().color.set('#0b1f3f');
            const controls = globe.controls();
            controls.autoRotate = !reduceMotion;
            controls.autoRotateSpeed = 0.5;
            controls.addEventListener('start', () => { controls.autoRotate = false; });
            globe.pointOfView({ lat: 34, lng: -98, altitude: 2.3 });

            new ResizeObserver(() => {
                if (dialog.open) globe.width(stage.clientWidth).height(stage.clientHeight);
            }).observe(stage);
            if (loading) loading.remove();
        } catch (err) {
            const message = loading || el('p', 'globe-loading');
            message.textContent = "The 3D globe couldn't load in this browser. The places are listed beside it.";
            stage.replaceChildren(message);
        }
    }

    $('globeOpen').addEventListener('click', openGlobe);
    $('globeDialog').addEventListener('close', () => { if (globe) globe.pauseAnimation(); });

    fetch('data/places.json', { cache: 'no-cache' })
        .then((r) => r.json())
        .then(renderPlaces)
        .catch(() => { $('globeMeta').textContent = ''; });

    /* ------------------------------------------------------------------ */
    /* Listening (Last.fm)                                                 */
    /* ------------------------------------------------------------------ */

    const LASTFM_BLANK_ART = '2a96cbd8b46e442fc41c2b86b821562f';

    // Live data and the daily snapshot (data/lastfm.json) share one shape:
    // { recent: {name, artist, art, nowPlaying, playedAt}, topArtists: [{name, plays}],
    //   topTracks: [{name, artist, plays}], stats: {plays, since} }

    function lastfm(method, params) {
        const q = new URLSearchParams({ method, user: LASTFM.user, api_key: LASTFM.apiKey, format: 'json', ...params });
        return fetch('https://ws.audioscrobbler.com/2.0/?' + q).then((r) => r.json()).then((data) => {
            if (data.error) throw new Error(data.message);
            return data;
        });
    }

    const normalize = {
        recent(data) {
            const t = [].concat(data.recenttracks.track || [])[0];
            if (!t) return null;
            return {
                name: t.name,
                artist: t.artist && (t.artist['#text'] || t.artist.name),
                art: (t.image || []).map((i) => i['#text']).filter((u) => u && !u.includes(LASTFM_BLANK_ART)).pop() || null,
                nowPlaying: !!(t['@attr'] && t['@attr'].nowplaying === 'true'),
                playedAt: t.date ? +t.date.uts : null,
            };
        },
        topArtists(data) {
            return [].concat(data.topartists.artist || []).map((a) => ({ name: a.name, plays: +a.playcount }));
        },
        topTracks(data) {
            return [].concat(data.toptracks.track || []).map((t) => ({ name: t.name, artist: t.artist && t.artist.name, plays: +t.playcount }));
        },
        stats(data) {
            return { plays: +data.user.playcount, since: +data.user.registered.unixtime };
        },
    };

    const LIVE_CALLS = {
        recent: ['user.getrecenttracks', { limit: 1 }],
        topArtists: ['user.gettopartists', { period: '1month', limit: 5 }],
        topTracks: ['user.gettoptracks', { period: '1month', limit: 5 }],
        stats: ['user.getinfo', {}],
    };

    function timeAgo(seconds) {
        const diff = Date.now() / 1000 - seconds;
        const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
        for (const [unit, size] of units) {
            const n = Math.floor(diff / size);
            if (n >= 1) return `${n} ${unit}${n > 1 ? 's' : ''} ago`;
        }
        return 'just now';
    }

    function setNowPlaying(status, track, artist, art, live) {
        $('npStatus').textContent = status;
        $('npTrack').textContent = track || '';
        $('npArtist').textContent = artist || '';
        $('npArt').style.backgroundImage = art ? `url("${art.replace(/"/g, '%22')}")` : '';
        $('nowPlaying').classList.toggle('live', !!live);
        $('npEq').hidden = !live || reduceMotion;
    }

    const render = {
        recent(r) {
            if (!r) return setNowPlaying('Nothing played yet', 'Waiting for the first song', '');
            const status = r.nowPlaying ? 'Now playing' : r.playedAt ? 'Last played ' + timeAgo(r.playedAt) : 'Recently played';
            setNowPlaying(status, r.name, r.artist, r.art, r.nowPlaying);
        },
        topArtists(items) {
            renderTopList($('topArtists'), items, 'artists');
        },
        topTracks(items) {
            renderTopList($('topTracks'), items, 'tracks');
        },
        stats(s) {
            const since = new Date(s.since * 1000).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
            $('musicStats').textContent = `${s.plays.toLocaleString()} songs played since ${since}`;
        },
    };

    function renderTopList(list, items, kind) {
        list.replaceChildren();
        if (!items || !items.length) {
            const message = items ? `Not enough listening this month to rank ${kind} yet.` : `Top ${kind} will show up here when Last.fm is reachable.`;
            list.appendChild(el('li', 'log-hint', message));
            return;
        }
        const max = Math.max(...items.map((i) => i.plays));
        items.forEach((item) => {
            const li = el('li');
            const text = el('span', 'item-text');
            text.appendChild(el('span', 'item-name', item.name));
            if (item.artist) text.appendChild(el('span', 'item-sub', item.artist));
            li.appendChild(text);
            li.appendChild(el('span', 'item-plays', `${item.plays.toLocaleString()} plays`));
            const bar = el('span', 'item-bar');
            const fill = el('b');
            fill.style.width = Math.max(6, (item.plays / max) * 100) + '%';
            bar.appendChild(fill);
            li.appendChild(bar);
            list.appendChild(li);
        });
    }

    // Artists / Tracks switch
    (function () {
        const tabs = [$('tabArtists'), $('tabTracks')];
        function select(tab) {
            tabs.forEach((t) => {
                const on = t === tab;
                t.setAttribute('aria-selected', String(on));
                t.tabIndex = on ? 0 : -1;
                $(t.getAttribute('aria-controls')).hidden = !on;
            });
        }
        tabs.forEach((tab, i) => {
            tab.addEventListener('click', () => select(tab));
            tab.addEventListener('keydown', (e) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                const next = tabs[(i + 1) % tabs.length];
                select(next);
                next.focus();
            });
        });
    })();

    async function loadLive(parts) {
        const shown = {};
        await Promise.all(parts.map(async (part) => {
            try {
                const [method, params] = LIVE_CALLS[part];
                render[part](normalize[part](await lastfm(method, params)));
                shown[part] = true;
            } catch (e) { /* keep whatever the snapshot showed */ }
        }));
        return shown;
    }

    async function startListening() {
        const snapshot = await fetch('data/lastfm.json', { cache: 'no-cache' })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
        if (snapshot) {
            Object.keys(render).forEach((part) => { if (snapshot[part] !== undefined) render[part](snapshot[part]); });
        }

        const live = LASTFM.apiKey ? await loadLive(Object.keys(LIVE_CALLS)) : {};
        if (!snapshot) {
            if (!live.recent) setNowPlaying('Offline', "Couldn't reach Last.fm right now", '');
            if (!live.topArtists) renderTopList($('topArtists'), null, 'artists');
            if (!live.topTracks) renderTopList($('topTracks'), null, 'tracks');
        }

        if (LASTFM.apiKey) {
            setInterval(() => { if (!document.hidden) loadLive(['recent']); }, 60000);
        }
    }

    whenNear($('musicCard'), startListening);
})();
