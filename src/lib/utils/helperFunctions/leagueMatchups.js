import { leagueID, getLeagueData } from "./leagueData"
import { getNflState } from "./nflState"
import { getLeagueRosters } from "./leagueRosters"
import { getLeagueUsers } from "./leagueUsers"
import { waitForAll } from './multiPromise';
import { get } from 'svelte/store';
import {matchupsStore} from '$lib/stores';

export const getLeagueMatchups = async () => {
	if(get(matchupsStore).matchupWeeks) {
		return get(matchupsStore);
	}

	const [nflState, leagueData, rosterRes, users] = await waitForAll(
		getNflState(),
		getLeagueData(),
		getLeagueRosters(),
		getLeagueUsers()
	).catch((err) => { console.error(err); });

	const week = nflState.display_week == 0 ? 1 : nflState.display_week;
	const year = leagueData.season;
	const regularSeasonLength = leagueData.settings.playoff_week_start - 1;

	const rosters = rosterRes.rosters;

	// pull in all matchup data for the season
	const matchupsPromises = [];
	for(let i = 1; i < leagueData.settings.playoff_week_start; i++) {
		matchupsPromises.push(fetch(`https://api.sleeper.app/v1/league/${leagueID}/matchups/${i}`, {compress: true}))
	}
	const matchupsRes = await waitForAll(...matchupsPromises);

	// convert the json matchup responses
	const matchupsJsonPromises = [];
	for(const matchupRes of matchupsRes) {
		const data = matchupRes.json();
		matchupsJsonPromises.push(data)
		if (!matchupRes.ok) {
			throw new Error(data);
		}
	}
	const matchupsData = await waitForAll(...matchupsJsonPromises).catch((err) => { console.error(err); }).catch((err) => { console.error(err); });

	const matchupWeeks = [];
	// process all the matchups
	for(let i = 1; i < matchupsData.length + 1; i++) {
		const processed = processMatchups(matchupsData[i - 1], rosters, users, i);
		if(processed) {
			matchupWeeks.push({
				matchups: processed.matchups,
				week: processed.week
			});
		}
	}

	const matchupsResponse = {
		matchupWeeks,
		year,
		week,
		regularSeasonLength
	}
	
	matchupsStore.update(() => matchupsResponse);

	return matchupsResponse;
}

const processMatchups = (inputMatchups, rosters, users, week) => {
	if(!inputMatchups || inputMatchups.length == 0) {
		return false;
	}
	const matchups = {};
	for(const match of inputMatchups) {
		if(!matchups[match.matchup_id]) {
			matchups[match.matchup_id] = [];
		}
		let user = users[rosters[match.roster_id - 1].owner_id];
		matchups[match.matchup_id].push({
			manager: {
				name: user.metadata.team_name ? user.metadata.team_name : user.display_name,
				avatar: `https://sleepercdn.com/avatars/thumbs/${user.avatar}`,
			},
			starters: match.starters,
			points: match.starters_points,
		})
	}
	return {matchups, week};
}
