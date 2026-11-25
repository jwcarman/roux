package items_test

import (
	"context"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"roux-the-day/internal/items"
)

func TestEveryEndpointChecksItsPermission(t *testing.T) {
	f := setup(t)
	id := "/api/items/" + f.add(f.asAda, nil)["id"].(string)
	none := f.SignedIn(f.Identity())
	anon := f.Browser()
	body := item{"title": "X", "day": "2026-11-24", "assigneeIds": []string{f.ada.String()}, "version": 0}
	for _, c := range []struct {
		method, path string
		body         any
	}{
		{"GET", "/api/items", nil},
		{"POST", "/api/items", body},
		{"GET", id, nil},
		{"PUT", id, body},
		{"DELETE", id, nil},
	} {
		anon.Do(c.method, c.path, c.body, true).Want(t, 401, "anonymous "+c.method+" "+c.path)
		none.Do(c.method, c.path, c.body, true).Want(t, 403, "no permission "+c.method+" "+c.path)
	}
}

func TestAddingAnItemReturnsItsDetail(t *testing.T) {
	f := setup(t)
	got := f.add(f.asAda, item{
		"title": "  Draft the agenda ", "notes": "two pages", "day": "2026-11-25", "at": "10:30",
		"assigneeIds": []string{f.grace.String(), f.ada.String()},
	})
	if got["title"] != "Draft the agenda" || got["notes"] != "two pages" || got["day"] != "2026-11-25" || got["at"] != "10:30" || got["done"] != false {
		t.Errorf("detail %v", got)
	}
	if names := got["assigneeNames"].([]any); len(names) != 2 || names[0] != "Ada Lovelace" || names[1] != "Grace Hopper" {
		t.Errorf("names %v", names)
	}
	if got["createdBy"] != f.ada.String() || got["canDelete"] != true || got["version"] != float64(0) {
		t.Errorf("author %v", got)
	}
	again := f.asG.Get("/api/items/"+got["id"].(string)).Want(t, 200, "GET").JSON(t)
	if again["canDelete"] != false || again["title"] != "Draft the agenda" {
		t.Errorf("as Grace %v", again)
	}
}

func TestAnAllDayItemHasNoTime(t *testing.T) {
	f := setup(t)
	if got := f.add(f.asAda, item{"at": nil}); got["at"] != nil {
		t.Errorf("at %v", got["at"])
	}
}

func TestAnItemNeedsATitleADayAndAnAssignee(t *testing.T) {
	f := setup(t)
	fifty := make([]string, 51)
	for i := range fifty {
		fifty[i] = uuid.NewString()
	}
	for name, c := range map[string]struct {
		body  item
		field string
	}{
		"blank title":          {item{"title": "  "}, "title"},
		"title of 121":         {item{"title": strings.Repeat("x", 121)}, "title"},
		"notes of 2001":        {item{"notes": strings.Repeat("x", 2001)}, "notes"},
		"no day":               {item{"day": ""}, "day"},
		"a bad day":            {item{"day": "2026-02-30"}, "day"},
		"a day with a time":    {item{"day": "2026-11-24T10:00"}, "day"},
		"24:00":                {item{"at": "24:00"}, "at"},
		"seconds":              {item{"at": "10:30:00"}, "at"},
		"no assignees":         {item{"assigneeIds": []string{}}, "assigneeIds"},
		"51 assignees":         {item{"assigneeIds": fifty}, "assigneeIds"},
		"not an id":            {item{"assigneeIds": []string{"ada"}}, "assigneeIds"},
		"nobody's id":          {item{"assigneeIds": []string{uuid.NewString()}}, "assigneeIds"},
		"a deactivated person": {item{"assigneeIds": []string{f.grace.String()}}, "assigneeIds"},
	} {
		t.Run(name, func(t *testing.T) {
			if name == "a deactivated person" {
				f.deactivate(f.grace)
			}
			full := item{"title": "Order the venue", "day": "2026-11-24", "assigneeIds": []string{f.ada.String()}}
			for k, v := range c.body {
				full[k] = v
			}
			r := f.asAda.Post("/api/items", full).Want(t, 400, name)
			if !strings.Contains(string(r.Body), `"field":"`+c.field+`"`) {
				t.Errorf("%s: %s", name, r.Body)
			}
		})
	}
}

func TestATitleOf120IsFine(t *testing.T) {
	f := setup(t)
	f.add(f.asAda, item{"title": strings.Repeat("é", 120), "notes": strings.Repeat("é", 2000)})
}

func TestDuplicateAssigneesCountOnce(t *testing.T) {
	f := setup(t)
	got := f.add(f.asAda, item{"assigneeIds": []string{f.ada.String(), f.ada.String()}})
	if names := got["assigneeNames"].([]any); len(names) != 1 {
		t.Errorf("names %v", names)
	}
}

// The clock is 2026-11-24 12:00 UTC: Tuesday 24 November in New York.
func listFixture(t *testing.T) *fx {
	f := setup(t)
	for _, it := range []item{
		{"title": "Last week", "day": "2026-11-17"},
		{"title": "Yesterday", "day": "2026-11-23", "at": "09:00"},
		{"title": "Done yesterday", "day": "2026-11-23", "at": "10:00"},
		{"title": "Today", "day": "2026-11-24", "assigneeIds": []string{f.grace.String()}},
		{"title": "Sunday", "day": "2026-11-29"},
		{"title": "Next Monday", "day": "2026-11-30"},
	} {
		got := f.add(f.asAda, it)
		if it["title"] == "Done yesterday" {
			f.asAda.Put("/api/items/"+got["id"].(string), item{
				"title": "Done yesterday", "day": "2026-11-23", "at": "10:00", "assigneeIds": []string{f.ada.String()}, "done": true, "version": 0,
			}).Want(t, 200, "PUT done")
		}
	}
	return f
}

func TestListFilters(t *testing.T) {
	f := listFixture(t)
	for query, want := range map[string][]string{
		"":                              {"Last week", "Yesterday", "Done yesterday", "Today", "Sunday", "Next Monday"},
		"?when=all":                     {"Last week", "Yesterday", "Done yesterday", "Today", "Sunday", "Next Monday"},
		"?when=overdue":                 {"Last week", "Yesterday"},
		"?when=today":                   {"Today"},
		"?when=week":                    {"Yesterday", "Done yesterday", "Today", "Sunday"},
		"?status=done":                  {"Done yesterday"},
		"?status=open&when=week":        {"Yesterday", "Today", "Sunday"},
		"?when=overdue&status=done":     {},
		"?assignee=" + f.grace.String(): {"Today"},
		"?search=yesterday":             {"Yesterday", "Done yesterday"},
	} {
		got := f.titles(f.asAda, query)
		if !slices.Equal(got, want) {
			t.Errorf("%q: %v", query, got)
		}
	}
	if got := f.titles(f.asG, "?assignee=me"); !slices.Equal(got, []string{"Today"}) {
		t.Errorf("Grace's: %v", got)
	}
}

func TestTheWeekRunsMondayToSunday(t *testing.T) {
	f := listFixture(t)
	// Moving the clock days ahead outlasts a session: sign in again after each move.
	f.at(time.Date(2026, 11, 30, 12, 0, 0, 0, time.UTC)) // Monday 30 November
	if got := f.titles(f.SignedIn(f.ada), "?when=week"); !slices.Equal(got, []string{"Next Monday"}) {
		t.Errorf("the next week: %v", got)
	}
	f.at(time.Date(2026, 11, 30, 3, 0, 0, 0, time.UTC).Add(7 * 24 * time.Hour)) // still Sunday 6 December in New York
	if got := f.titles(f.SignedIn(f.ada), "?when=week"); !slices.Equal(got, []string{"Next Monday"}) {
		t.Errorf("Sunday night: %v", got)
	}
}

func TestTodayIsTheTeamsToday(t *testing.T) {
	f := listFixture(t)
	f.zone = "Pacific/Auckland" // 2026-11-24 12:00 UTC is already Wednesday the 25th there
	if got := f.titles(f.asAda, "?when=today"); len(got) != 0 {
		t.Errorf("today in Auckland: %v", got)
	}
	if got := f.titles(f.asAda, "?when=overdue"); !slices.Equal(got, []string{"Last week", "Yesterday", "Today"}) {
		t.Errorf("overdue in Auckland: %v", got)
	}
}

func TestADaylightSavingDayIsOneDay(t *testing.T) {
	f := listFixture(t)
	// 2026-11-01 is the day New York's clocks go back; 23:30 that night is 04:30 UTC the next day.
	f.add(f.asAda, item{"title": "The long day", "day": "2026-11-01"})
	f.at(time.Date(2026, 11, 2, 4, 30, 0, 0, time.UTC))
	if got := f.titles(f.asAda, "?when=today"); !slices.Equal(got, []string{"The long day"}) {
		t.Errorf("today: %v", got)
	}
}

func TestListRefusesAnUnknownWhenStatusOrAssignee(t *testing.T) {
	f := setup(t)
	for query, field := range map[string]string{
		"?when=tomorrow":                      "when",
		"?status=closed":                      "status",
		"?assignee=ada":                       "assignee",
		"?sortBy=PRICE":                       "sortBy",
		"?search=" + strings.Repeat("x", 201): "search",
	} {
		r := f.asAda.Get("/api/items"+query).Want(t, 400, query)
		if !strings.Contains(string(r.Body), `"field":"`+field+`"`) {
			t.Errorf("%s: %s", query, r.Body)
		}
	}
	if got := f.titles(f.asAda, "?assignee="+uuid.NewString()); len(got) != 0 {
		t.Errorf("nobody's: %v", got)
	}
}

func TestListSortsByDayTitleOrAssignee(t *testing.T) {
	f := setup(t)
	f.add(f.asAda, item{"title": "b", "day": "2026-11-25", "at": "09:00", "assigneeIds": []string{f.grace.String()}})
	f.add(f.asAda, item{"title": "A", "day": "2026-11-25", "at": nil, "assigneeIds": []string{f.olive.String()}})
	f.add(f.asAda, item{"title": "c", "day": "2026-11-24", "at": "18:00", "assigneeIds": []string{f.ada.String()}})
	for query, want := range map[string][]string{
		"":                               {"c", "A", "b"},
		"?sortBy=DAY&sortDirection=DESC": {"b", "A", "c"},
		"?sortBy=TITLE":                  {"A", "b", "c"},
		"?sortBy=ASSIGNEE":               {"c", "b", "A"},
	} {
		if got := f.titles(f.asAda, query); !slices.Equal(got, want) {
			t.Errorf("%q: %v", query, got)
		}
	}
}

func put(version int, assignees ...uuid.UUID) item {
	ids := []string{}
	for _, a := range assignees {
		ids = append(ids, a.String())
	}
	return item{"title": "Order the venue", "day": "2026-11-24", "assigneeIds": ids, "version": version}
}

func TestEditingFromAStaleVersionIsAConflict(t *testing.T) {
	f := setup(t)
	id := "/api/items/" + f.add(f.asAda, nil)["id"].(string)
	f.asAda.Put(id, put(0, f.ada)).Want(t, 200, "first edit")
	f.asG.Put(id, put(0, f.grace)).Want(t, 409, "a stale edit")
	f.asG.Put(id, item{"title": "x", "day": "2026-11-24", "assigneeIds": []string{f.ada.String()}}).Want(t, 400, "no version")
	f.asG.Put("/api/items/"+uuid.NewString(), put(0, f.ada)).Want(t, 404, "nobody's item")
	f.asG.Put("/api/items/nope", put(0, f.ada)).Want(t, 404, "not an id")
}

func TestChangingOnlyAssigneesBumpsTheVersion(t *testing.T) {
	f := setup(t)
	id := "/api/items/" + f.add(f.asAda, nil)["id"].(string)
	got := f.asAda.Put(id, put(0, f.grace)).Want(t, 200, "reassign").JSON(t)
	if got["version"] != float64(1) || got["assigneeNames"].([]any)[0] != "Grace Hopper" {
		t.Errorf("after %v", got)
	}
	f.asG.Put(id, put(0, f.ada)).Want(t, 409, "the old version")
	if got := f.asG.Put(id, item{
		"title": "Venue booked", "notes": "deposit paid", "day": "2026-11-26", "at": "08:15",
		"assigneeIds": []string{f.ada.String()}, "done": true, "version": 1,
	}).Want(t, 200, "edit").JSON(t); got["title"] != "Venue booked" || got["done"] != true || got["at"] != "08:15" || got["notes"] != "deposit paid" {
		t.Errorf("edited %v", got)
	}
}

func TestAnItemKeepsADeactivatedAssignee(t *testing.T) {
	f := setup(t)
	id := "/api/items/" + f.add(f.asAda, item{"assigneeIds": []string{f.grace.String()}})["id"].(string)
	f.deactivate(f.grace)
	if got := f.titles(f.asAda, ""); !slices.Equal(got, []string{"Order the venue"}) {
		t.Fatalf("listed %v", got)
	}
	detail := f.asAda.Get(id).Want(t, 200, "GET").JSON(t)
	if a := detail["assignees"].([]any)[0].(map[string]any); a["name"] != "Grace Hopper" || a["active"] != false {
		t.Errorf("assignee %v", a)
	}
	f.asAda.Put(id, put(0, f.grace)).Want(t, 400, "keeping them")
	f.asAda.Put(id, put(0, f.ada)).Want(t, 200, "replacing them")
}

func TestOnlyTheAuthorOrAnOwnerMayDelete(t *testing.T) {
	f := setup(t)
	first := "/api/items/" + f.add(f.asAda, nil)["id"].(string)
	second := "/api/items/" + f.add(f.asAda, nil)["id"].(string)
	f.asG.Delete(first).Want(t, 403, "Grace deletes Ada's")
	f.asAda.Delete(first).Want(t, 204, "Ada deletes her own")
	f.asOlive.Delete(second).Want(t, 204, "an owner deletes Ada's")
	f.asAda.Delete(second).Want(t, 404, "gone")
	if got := f.asOlive.Get(first).Want(t, 404, "gone").JSON(t); got["status"] != float64(404) {
		t.Errorf("%v", got)
	}
}

func TestTheModuleChecksItsListAtStart(t *testing.T) {
	f := setup(t)
	if err := items.CheckList(context.Background(), f.Pool); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(context.Background(), `drop view item_list; create view item_list as select id from item`); err != nil {
		t.Fatal(err)
	}
	if err := items.CheckList(context.Background(), f.Pool); err == nil {
		t.Fatal("a view without the list's columns passed")
	}
}
