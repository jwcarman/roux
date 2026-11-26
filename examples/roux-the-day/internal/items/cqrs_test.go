package items_test

import (
	"slices"
	"strings"
	"testing"

	"github.com/google/uuid"
)

// rows is the titles and statuses of the items query's page, in order.
func (f *fx) rows(query string) (titles, statuses []string) {
	f.T.Helper()
	var pg struct {
		Data []struct {
			Title  string `json:"title"`
			Status string `json:"status"`
		} `json:"data"`
	}
	f.asAda.Get("/api/queries/items"+query).Want(f.T, 200, "GET items"+query).Decode(f.T, &pg)
	titles, statuses = []string{}, []string{}
	for _, r := range pg.Data {
		titles = append(titles, r.Title)
		statuses = append(statuses, r.Status)
	}
	return titles, statuses
}

func TestItemsQueryFiltersByWhenStatusAndAssignee(t *testing.T) {
	f := listFixture(t)
	for query, want := range map[string][]string{
		"":                                 {"Last week", "Yesterday", "Done yesterday", "Today", "Sunday", "Next Monday"},
		"?when=all&status=&assignee=":      {"Last week", "Yesterday", "Done yesterday", "Today", "Sunday", "Next Monday"},
		"?when=overdue":                    {"Last week", "Yesterday"},
		"?when=today":                      {"Today"},
		"?when=week":                       {"Yesterday", "Done yesterday", "Today", "Sunday"},
		"?status=done":                     {"Done yesterday"},
		"?status=open&when=week":           {"Yesterday", "Today", "Sunday"},
		"?assignee=anyone":                 {"Last week", "Yesterday", "Done yesterday", "Today", "Sunday", "Next Monday"},
		"?assignee=me":                     {"Last week", "Yesterday", "Done yesterday", "Sunday", "Next Monday"},
		"?search=yesterday":                {"Yesterday", "Done yesterday"},
		"?when=overdue&status=done":        {},
		"?sortBy=TITLE&search=yesterday":   {"Done yesterday", "Yesterday"},
		"?pageSize=2&pageIndex=1&when=all": {"Done yesterday", "Today"},
	} {
		got, _ := f.rows(query)
		if !slices.Equal(got, want) {
			t.Errorf("%q: %v", query, got)
		}
	}
	if titles, statuses := f.rows("?when=week"); !slices.Equal(statuses, []string{"Open", "Done", "Open", "Open"}) {
		t.Errorf("%v statuses %v", titles, statuses)
	}
	f.asAda.Get("/api/queries/items?when=someday").Want(t, 400, "an unknown when")
}

func TestItemCountsCountsOpenOverdueToday(t *testing.T) {
	f := listFixture(t)
	var got struct{ Open, Overdue, Today int }
	f.asAda.Get("/api/queries/itemCounts").Want(t, 200, "GET itemCounts").Decode(t, &got)
	// Open: all but "Done yesterday"; overdue: Last week, Yesterday; today: Today.
	if got.Open != 5 || got.Overdue != 2 || got.Today != 1 {
		t.Errorf("counts %+v", got)
	}
}

func TestAddItemAssignsTheCaller(t *testing.T) {
	f := setup(t)
	var out struct {
		Result struct {
			ID uuid.UUID `json:"id"`
		} `json:"result"`
		Events []string `json:"events"`
	}
	f.asG.Post("/api/commands/addItem", item{"title": " Book the room ", "day": "2026-11-25"}).
		Want(t, 200, "POST addItem").Decode(t, &out)
	if !slices.Equal(out.Events, []string{"itemsChanged"}) {
		t.Errorf("events %v", out.Events)
	}
	got := f.asG.Get("/api/items/"+out.Result.ID.String()).Want(t, 200, "GET the item").JSON(t)
	names := got["assigneeNames"].([]any)
	if got["title"] != "Book the room" || got["day"] != "2026-11-25" || got["at"] != nil || got["done"] != false ||
		len(names) != 1 || names[0] != "Grace Hopper" || got["createdBy"] != f.grace.String() {
		t.Errorf("item %v", got)
	}
}

func TestAddItemWithoutADayIsForTheTeamsToday(t *testing.T) {
	f := setup(t)
	f.zone = "Pacific/Auckland" // the clock's 2026-11-24 12:00 UTC is already Wednesday the 25th there
	for name, body := range map[string]item{
		"no day":    {"title": "No day"},
		"null day":  {"title": "Null day", "day": nil},
		"blank day": {"title": "Blank day", "day": "  "},
	} {
		var out struct {
			Result struct {
				ID uuid.UUID `json:"id"`
			} `json:"result"`
		}
		f.asG.Post("/api/commands/addItem", body).Want(t, 200, name).Decode(t, &out)
		if got := f.asG.Get("/api/items/"+out.Result.ID.String()).Want(t, 200, "GET "+name).JSON(t); got["day"] != "2026-11-25" {
			t.Errorf("%s: day %v", name, got["day"])
		}
	}
}

func TestAddItemValidates(t *testing.T) {
	f := setup(t)
	for name, c := range map[string]struct {
		body  item
		field string
	}{
		"blank title": {item{"title": "  ", "day": "2026-11-25"}, "title"},
		"no title":    {item{"day": "2026-11-25"}, "title"},
		"long title":  {item{"title": strings.Repeat("x", 121), "day": "2026-11-25"}, "title"},
		"day format":  {item{"title": "X", "day": "24-11-2026"}, "day"},
	} {
		r := f.asAda.Post("/api/commands/addItem", c.body).Want(t, 400, name)
		if !strings.Contains(string(r.Body), `"field":"`+c.field+`"`) {
			t.Errorf("%s: %s", name, r.Body)
		}
	}
}

func TestTheNewEndpointsCheckTheirPermissions(t *testing.T) {
	f := setup(t)
	none := f.SignedIn(f.Identity())
	for _, c := range []struct {
		method, path string
		body         any
	}{
		{"GET", "/api/queries/items", nil},
		{"GET", "/api/queries/itemCounts", nil},
		{"POST", "/api/commands/addItem", item{"title": "X", "day": "2026-11-25"}},
	} {
		f.Browser().Do(c.method, c.path, c.body, true).Want(t, 401, "anonymous "+c.path)
		none.Do(c.method, c.path, c.body, true).Want(t, 403, "no permission "+c.path)
	}
}
